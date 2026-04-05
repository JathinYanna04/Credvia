import { handleApiError, ok, parseJson, fail } from "@/lib/api";
import { CreatePostSchema } from "@/lib/schemas/post";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sanitizeHtml } from "@/lib/utils/sanitize";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRequiredUser } from "@/lib/supabase/helpers";
import { isMissingStartupIdeaAdvancedSchemaError } from "@/lib/supabase/startup-idea-schema";
import { toPostSummaries } from "@/lib/supabase/query-helpers";
import { logError, logInfo } from "@/lib/utils/logger";

const STARTUP_EVIDENCE_BUCKET = "startup-evidence";
const STARTUP_EVIDENCE_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
const STARTUP_EVIDENCE_MAX_FILES = 5;
const STARTUP_EVIDENCE_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function trimFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseSupportingEvidenceLinks(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildStartupIdeaBody(
  startupIdea: NonNullable<
    Awaited<ReturnType<typeof parseCreatePostRequest>>["body"]["startup_idea"]
  >,
  uploadedEvidenceUrls: string[] = [],
) {
  const evidenceLinks = [
    ...(startupIdea.supporting_evidence_links ?? []),
    ...uploadedEvidenceUrls,
  ];

  return [
    `## Domain\n${startupIdea.market_category}`,
    `## Problem Statement\n${startupIdea.problem}`,
    `## Target Audience\n${startupIdea.target_audience}`,
    `## Solution Overview\n${startupIdea.solution}`,
    `## Existing Alternatives\n${startupIdea.existing_alternatives ?? "Not provided yet."}`,
    `## What Makes Your Solution Better?\n${startupIdea.differentiation ?? "Not provided yet."}`,
    `## Evidence of Problem\n${startupIdea.evidence_of_problem ?? "Not provided yet."}`,
    `## Startup Stage\n${
      startupIdea.stage === "problem_validation"
        ? "Problem Validation"
        : startupIdea.stage === "mvp_building"
          ? "MVP"
          : startupIdea.stage === "early_users"
            ? "Early Users"
            : "Idea"
    }`,
    `## Biggest Risk / Assumption\n${startupIdea.biggest_risk_assumption ?? "Not provided yet."}`,
    `## Monetization Model\n${startupIdea.monetization_model ?? "Not provided yet."}`,
    evidenceLinks.length > 0
      ? `## Supporting Evidence (Optional)\n${evidenceLinks
          .map((link) => `- ${link}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function parseCreatePostRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return {
      body: await parseJson(request, CreatePostSchema),
      evidenceFiles: [] as File[],
    };
  }

  const formData = await request.formData();
  const postType = trimFormValue(formData.get("post_type"));
  const supportingEvidenceLinks = parseSupportingEvidenceLinks(
    trimFormValue(formData.get("startup_idea.supporting_evidence_links")),
  );

  return {
    body: CreatePostSchema.parse({
      title: trimFormValue(formData.get("title")),
      post_type: postType,
      community_id: trimFormValue(formData.get("community_id")),
      body_md: trimFormValue(formData.get("body_md")) || undefined,
      external_url: trimFormValue(formData.get("external_url")) || undefined,
      media_url: trimFormValue(formData.get("media_url")) || undefined,
      startup_idea:
        postType === "startup_idea"
          ? {
              problem: trimFormValue(formData.get("startup_idea.problem")),
              target_audience: trimFormValue(
                formData.get("startup_idea.target_audience"),
              ),
              solution: trimFormValue(formData.get("startup_idea.solution")),
              market_category: trimFormValue(
                formData.get("startup_idea.market_category"),
              ),
              stage: trimFormValue(formData.get("startup_idea.stage")),
              monetization_model:
                trimFormValue(
                  formData.get("startup_idea.monetization_model"),
                ) || undefined,
              existing_alternatives:
                trimFormValue(
                  formData.get("startup_idea.existing_alternatives"),
                ) || undefined,
              differentiation:
                trimFormValue(formData.get("startup_idea.differentiation")) ||
                undefined,
              evidence_of_problem:
                trimFormValue(
                  formData.get("startup_idea.evidence_of_problem"),
                ) || undefined,
              biggest_risk_assumption:
                trimFormValue(
                  formData.get("startup_idea.biggest_risk_assumption"),
                ) || undefined,
              supporting_evidence_links:
                supportingEvidenceLinks.length > 0
                  ? supportingEvidenceLinks
                  : undefined,
            }
          : undefined,
    }),
    evidenceFiles: formData
      .getAll("startup_idea.supporting_evidence_files")
      .filter(
        (entry): entry is File => entry instanceof File && entry.size > 0,
      ),
  };
}

async function uploadStartupEvidenceFiles(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  postId: string,
  files: File[],
) {
  const uploadedPaths: string[] = [];
  const uploadedUrls: string[] = [];

  try {
    for (const file of files) {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const storagePath = `${userId}/${postId}/${crypto.randomUUID()}-${safeFileName}`;
      const uploadResult = await supabase.storage
        .from(STARTUP_EVIDENCE_BUCKET)
        .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadResult.error) {
        throw new Error(uploadResult.error.message);
      }

      uploadedPaths.push(storagePath);
      uploadedUrls.push(
        supabase.storage.from(STARTUP_EVIDENCE_BUCKET).getPublicUrl(storagePath)
          .data.publicUrl,
      );
    }

    return { uploadedPaths, uploadedUrls };
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage
        .from(STARTUP_EVIDENCE_BUCKET)
        .remove(uploadedPaths);
    }
    throw error;
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(error.message);
    }

    const posts = await toPostSummaries(supabase, data ?? []);
    return ok(posts);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const { body, evidenceFiles } = await parseCreatePostRequest(request);
    const requestId = crypto.randomUUID();

    logInfo("posts-create", "Create post request received", {
      requestId,
      userId: user.id,
      postType: body.post_type,
      communityId: body.community_id,
      hasStartupIdea: Boolean(body.startup_idea),
    });

    const limit = await enforceRateLimit("post_create", user.id);

    if (!limit.success) {
      return fail(
        "RATE_LIMITED",
        "Too many posts created. Try again soon.",
        429,
      );
    }

    if (evidenceFiles.length > STARTUP_EVIDENCE_MAX_FILES) {
      return fail(
        "VALIDATION_ERROR",
        "Supporting Evidence (Optional) accepts up to 5 files.",
        400,
      );
    }

    for (const file of evidenceFiles) {
      if (file.size > STARTUP_EVIDENCE_FILE_SIZE_LIMIT_BYTES) {
        return fail(
          "VALIDATION_ERROR",
          "Supporting evidence files must be 10 MB or smaller.",
          400,
        );
      }

      if (!STARTUP_EVIDENCE_ALLOWED_MIME_TYPES.has(file.type)) {
        return fail(
          "VALIDATION_ERROR",
          "Supporting evidence files must be PNG, JPG, WEBP, or PDF.",
          400,
        );
      }
    }

    const startupIdeaBody =
      body.post_type === "startup_idea" &&
      body.startup_idea &&
      (!body.body_md || body.body_md.trim().length === 0)
        ? buildStartupIdeaBody(body.startup_idea)
        : (body.body_md ?? "");

    const { data, error } = await supabase
      .from("posts")
      .insert({
        title: body.title,
        post_type: body.post_type,
        community_id: body.community_id,
        body_md: startupIdeaBody || null,
        body_html: sanitizeHtml(startupIdeaBody),
        external_url: body.external_url || null,
        media_url: body.media_url ?? null,
        author_id: user.id,
        status: "published",
      })
      .select("*")
      .single();

    if (error) {
      logError("posts-create", "Failed to insert post row", {
        requestId,
        userId: user.id,
        postType: body.post_type,
        error: error.message,
      });
      throw new Error(error.message);
    }

    if (body.post_type === "startup_idea" && body.startup_idea) {
      let finalBodyMd = startupIdeaBody;
      let finalBodyHtml = sanitizeHtml(startupIdeaBody);
      let uploadedEvidencePaths: string[] = [];

      const startupIdeaInsert = await supabase.from("startup_ideas").insert({
        post_id: data.id,
        founder_user_id: user.id,
        problem: body.startup_idea.problem,
        target_audience: body.startup_idea.target_audience,
        solution: body.startup_idea.solution,
        market_category: body.startup_idea.market_category,
        stage: body.startup_idea.stage,
        monetization_model: body.startup_idea.monetization_model ?? null,
      });

      if (startupIdeaInsert.error) {
        logError("posts-create", "Failed to insert startup_ideas row", {
          requestId,
          userId: user.id,
          postId: data.id,
          error: startupIdeaInsert.error.message,
        });
        await supabase.from("posts").delete().eq("id", data.id);
        throw new Error(startupIdeaInsert.error.message);
      }

      try {
        if (evidenceFiles.length > 0) {
          const uploadResult = await uploadStartupEvidenceFiles(
            supabase,
            user.id,
            data.id,
            evidenceFiles,
          );
          uploadedEvidencePaths = uploadResult.uploadedPaths;
          finalBodyMd = buildStartupIdeaBody(
            body.startup_idea,
            uploadResult.uploadedUrls,
          );
          finalBodyHtml = sanitizeHtml(finalBodyMd);

          const postUpdate = await supabase
            .from("posts")
            .update({
              body_md: finalBodyMd,
              body_html: finalBodyHtml,
            })
            .eq("id", data.id);

          if (postUpdate.error) {
            throw new Error(postUpdate.error.message);
          }
        }

        const revisionInsert = await supabase
          .from("startup_idea_revisions")
          .insert({
            post_id: data.id,
            revision_number: 1,
            title: data.title,
            body_md: finalBodyMd,
            body_html: finalBodyHtml,
            problem: body.startup_idea.problem,
            target_audience: body.startup_idea.target_audience,
            solution: body.startup_idea.solution,
            market_category: body.startup_idea.market_category,
            stage: body.startup_idea.stage,
            monetization_model: body.startup_idea.monetization_model ?? null,
            change_summary: "Initial thesis snapshot",
            created_by: user.id,
          })
          .select("id")
          .single();

        if (revisionInsert.error || !revisionInsert.data) {
          throw new Error(
            revisionInsert.error?.message ??
              "Could not create startup idea revision.",
          );
        }

        const startupIdeaUpdate = await supabase
          .from("startup_ideas")
          .update({
            current_revision_id: revisionInsert.data.id,
            revision_count: 1,
            follower_count: 0,
            last_revision_at: new Date().toISOString(),
          })
          .eq("post_id", data.id);

        if (startupIdeaUpdate.error) {
          throw new Error(startupIdeaUpdate.error.message);
        }

        data.body_md = finalBodyMd;
        data.body_html = finalBodyHtml;
      } catch (advancedSchemaError) {
        if (!isMissingStartupIdeaAdvancedSchemaError(advancedSchemaError)) {
          if (uploadedEvidencePaths.length > 0) {
            await supabase.storage
              .from(STARTUP_EVIDENCE_BUCKET)
              .remove(uploadedEvidencePaths);
          }
          logError(
            "posts-create",
            "Failed to create startup idea advanced metadata",
            {
              requestId,
              userId: user.id,
              postId: data.id,
              error:
                advancedSchemaError instanceof Error
                  ? advancedSchemaError.message
                  : "Unknown advanced startup idea error",
            },
          );
          await supabase.from("startup_ideas").delete().eq("post_id", data.id);
          await supabase.from("posts").delete().eq("id", data.id);
          throw advancedSchemaError;
        }
      }
    }

    const [post] = await toPostSummaries(supabase, [data]);
    logInfo("posts-create", "Create post request succeeded", {
      requestId,
      postId: post?.id ?? data.id,
      postType: body.post_type,
    });
    return ok(post);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "You need to sign in.", 401);
    }

    logError("posts-create", "Create post request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return handleApiError(error);
  }
}
