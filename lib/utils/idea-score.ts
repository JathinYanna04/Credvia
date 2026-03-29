export interface IdeaScoreInput {
  voteScore: number;
  commentCount: number;
  saveCount: number;
  uniqueCommenters: number;
  createdAt: string;
}

export function computeIdeaValidationScore(input: IdeaScoreInput) {
  const hoursSinceCreated = Math.max(
    1,
    (Date.now() - new Date(input.createdAt).getTime()) / (1000 * 60 * 60),
  );
  const recencyBoost = Math.max(0, 18 - hoursSinceCreated / 6);

  const score =
    input.voteScore * 3 +
    input.commentCount * 2 +
    input.uniqueCommenters * 4 +
    input.saveCount * 2 +
    recencyBoost;

  return Number(score.toFixed(2));
}
