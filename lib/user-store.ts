import { prisma } from "@/lib/prisma";
import type { User } from "@/types/api";

export function mapUser(record: {
  id: string;
  email: string | null;
  phone: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: record.id as User["id"],
    email: record.email,
    phone: record.phone,
    nickname: record.nickname,
    avatarUrl: record.avatarUrl,
    status: record.status as User["status"],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const userStore = {
  async getById(userId: string) {
    return prisma.user.findUnique({ where: { id: userId } });
  },

  async getByNickname(nickname: string) {
    return prisma.user.findUnique({ where: { nickname } });
  },
};
