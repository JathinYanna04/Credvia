export interface IdeaScoreInput {
  voteScore: number;
  commentCount: number;
  saveCount: number;
  uniqueCommenters: number;
}

export function computeIdeaValidationScore(input: IdeaScoreInput) {
  const score =
    input.voteScore * 3 +
    input.commentCount * 2 +
    input.uniqueCommenters * 4 +
    input.saveCount * 2;

  return Number(score.toFixed(2));
}
