function ipv4ToInt(ip: string) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return (
    ((parts[0]! << 24) >>> 0) +
    ((parts[1]! << 16) >>> 0) +
    ((parts[2]! << 8) >>> 0) +
    (parts[3]! >>> 0)
  ) >>> 0;
}

export interface ParsedCidr {
  raw: string;
  network: number;
  mask: number;
  prefix: number;
}

export function parseTrustedCidrs(rawValue: string | null | undefined) {
  if (!rawValue) {
    return [] as ParsedCidr[];
  }

  return rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [ip, prefixValue] = entry.split('/');
      const prefix = Number(prefixValue);
      const network = ipv4ToInt(ip ?? '');
      if (network === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
        return [];
      }

      const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
      return [{ raw: entry, network: network & mask, mask, prefix }];
    });
}

export function isIpTrusted(ip: string | null | undefined, cidrs: ParsedCidr[]) {
  if (!ip || cidrs.length === 0) {
    return false;
  }

  const normalized = ip.includes(':') ? null : ipv4ToInt(ip.trim());
  if (normalized === null) {
    return false;
  }

  return cidrs.some((cidr) => (normalized & cidr.mask) === cidr.network);
}

export function resolveClientIpFromHeaders(request: Request, trustedCidrs: ParsedCidr[]) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip')?.trim() ?? null;

  if (!forwardedFor) {
    return realIp;
  }

  const hopChain = forwardedFor
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (hopChain.length === 0) {
    return realIp;
  }

  const immediateProxy = realIp ?? hopChain[hopChain.length - 1] ?? null;
  if (trustedCidrs.length > 0 && !isIpTrusted(immediateProxy, trustedCidrs)) {
    return realIp;
  }

  return hopChain[0] ?? realIp;
}
