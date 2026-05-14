import { prisma } from "@/lib/prisma";
import type {
  AnalysisSessionId,
  CreateResumeVersionRequestCompat,
  Pagination,
  ResumeVersion,
  ResumeVersionId,
} from "@/types/api";

const createId = <T extends string>(prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}` as T;

function mapResumeVersion(record: {
  id: string;
  userId: string;
  sessionId: string;
  title: string;
  jobTitle: string | null;
  jobCategory: string | null;
  sourceType: string;
  resumeText: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ResumeVersion {
  return {
    id: record.id as ResumeVersionId,
    userId: record.userId as ResumeVersion["userId"],
    sessionId: record.sessionId as AnalysisSessionId,
    title: record.title,
    jobTitle: record.jobTitle,
    jobCategory: record.jobCategory,
    sourceType: record.sourceType as ResumeVersion["sourceType"],
    resumeText: record.resumeText,
    isArchived: record.isArchived,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const versionStore = {
  async createVersion(input: CreateResumeVersionRequestCompat, userId: string) {
    // Accept the legacy optimizedResumeText field for backward compatibility.
    const resumeText = input.rewrittenResumeText?.trim() || input.optimizedResumeText?.trim();
    const session = await prisma.analysisSession.findUnique({ where: { id: input.sessionId } });
    if (!session) {
      throw new Error("analysis session not found");
    }
    if (!resumeText) {
      throw new Error("rewritten resume text is required");
    }

    const version = await prisma.resumeVersion.create({
      data: {
        id: createId<ResumeVersionId>("rv"),
        userId,
        sessionId: input.sessionId,
        title: input.title,
        jobTitle: session.jobTitle,
        jobCategory: session.jobCategory,
        sourceType: "optimized",
        resumeText,
        isArchived: false,
      },
    });

    return mapResumeVersion(version);
  },

  async listVersions(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, totalItems] = await Promise.all([
      prisma.resumeVersion.findMany({
        where: { userId, isArchived: false },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.resumeVersion.count({
        where: { userId, isArchived: false },
      }),
    ]);

    const pagination: Pagination = {
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };

    return {
      items: items.map(mapResumeVersion),
      pagination,
    };
  },

  async getVersion(versionId: string, userId?: string) {
    const version = await prisma.resumeVersion.findUnique({ where: { id: versionId } });
    if (version && userId && version.userId !== userId) {
      return null;
    }
    return version ? mapResumeVersion(version) : null;
  },
};
