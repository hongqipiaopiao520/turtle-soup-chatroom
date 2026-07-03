import type { ManagedPuzzle } from "./types";

export type AgentAuditLevel = "高" | "中" | "低";

export interface PuzzleAgentAudit {
  profileCompleteness: number;
  recommendationReadiness: AgentAuditLevel;
  spoilerRisk: AgentAuditLevel;
  tagConfidence: AgentAuditLevel;
  suggestions: string[];
}

function levelFromScore(score: number): AgentAuditLevel {
  if (score >= 75) return "高";
  if (score >= 45) return "中";
  return "低";
}

function hasAny(values: string[] | undefined) {
  return Boolean(values && values.length > 0);
}

function includesTruthLikeText(puzzle: ManagedPuzzle) {
  const pitch = puzzle.aiProfile?.spoilerFreePitch ?? "";
  return puzzle.solutionPoints.some((point) => point.length >= 4 && pitch.includes(point))
    || (puzzle.truth.length >= 8 && pitch.includes(puzzle.truth.slice(0, 8)));
}

export function createPuzzleAgentAudit(puzzle?: ManagedPuzzle): PuzzleAgentAudit {
  if (!puzzle?.aiProfile) {
    return {
      profileCompleteness: 20,
      recommendationReadiness: "低",
      spoilerRisk: "中",
      tagConfidence: puzzle && puzzle.tags.length > 0 ? "中" : "低",
      suggestions: ["先生成 AI 画像，再进入开局 Agent 推荐池。"]
    };
  }

  const profile = puzzle.aiProfile;
  let completeness = 0;
  if (hasAny(profile.themes)) completeness += 16;
  if (hasAny(profile.moods)) completeness += 14;
  if (hasAny(profile.twistTypes)) completeness += 12;
  if (hasAny(profile.suitableFor)) completeness += 10;
  if (profile.spoilerFreePitch.trim().length >= 12) completeness += 16;
  if (profile.estimatedQuestions >= 8) completeness += 10;
  if (profile.profileVersion > 0 && profile.generatedAt) completeness += 8;
  if (profile.intensity && Object.values(profile.intensity).every((value) => Number.isFinite(value))) completeness += 14;

  const profileTerms = new Set([...profile.themes, ...profile.moods, ...profile.twistTypes, ...profile.suitableFor]);
  const overlappingTags = puzzle.tags.filter((tag) => profileTerms.has(tag));
  const tagConfidenceScore = puzzle.tags.length === 0 ? 20 : Math.min(100, 45 + overlappingTags.length * 18 + Math.min(20, puzzle.tags.length * 4));
  const spoilerRisk: AgentAuditLevel = includesTruthLikeText(puzzle)
    ? "高"
    : profile.spoilerFreePitch.length > 44
      ? "中"
      : "低";
  const readinessPenalty = spoilerRisk === "高" ? 40 : spoilerRisk === "中" ? 12 : 0;
  const readinessScore = Math.max(0, completeness + Math.min(10, puzzle.qualityScore / 10) - readinessPenalty);
  const suggestions: string[] = [];

  if (completeness < 80) suggestions.push("补全 themes、moods、twistTypes、suitableFor 和 estimatedQuestions。");
  if (tagConfidenceScore < 70) suggestions.push("检查公开标签和 AI 画像主题是否一致，避免推荐命中偏移。");
  if (profile.contentWarnings.length === 0 && Math.max(profile.intensity.gore, profile.intensity.horror, profile.intensity.sadness) >= 3) {
    suggestions.push("强度较高，建议补充 contentWarnings。");
  }
  if (spoilerRisk !== "低") suggestions.push("推荐语可能接近汤底，建议重写 spoilerFreePitch。");
  if (suggestions.length === 0) suggestions.push("画像完整，可进入开局 Agent 推荐池。");

  return {
    profileCompleteness: Math.max(0, Math.min(100, completeness)),
    recommendationReadiness: levelFromScore(readinessScore),
    spoilerRisk,
    tagConfidence: levelFromScore(tagConfidenceScore),
    suggestions
  };
}
