import { NextResponse } from "next/server";
import { analysisStore } from "@/lib/analysis-store";
import { createGenerationStream, wantsEventStream } from "@/lib/generation-stream";
import type { TriggerInterviewQuestionsRequest } from "@/types/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = (await request.json()) as Partial<TriggerInterviewQuestionsRequest>;

  try {
    const session = await analysisStore.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Session not found" }, requestId: crypto.randomUUID() },
        { status: 404 }
      );
    }

    if (wantsEventStream(request)) {
      return createGenerationStream("interviewQuestions", async (emit) => {
        if (body.detailQuestionId) {
          const question = await analysisStore.generateAndSaveInterviewQuestionDetail(sessionId, body.detailQuestionId, {
            onProgress: emit,
          });
          if (!question) {
            throw new Error("未找到要补全的面试题");
          }
          return { success: true, data: { sessionId, question }, requestId: crypto.randomUUID() };
        }

        const cachedQuestions = await analysisStore.getInterviewQuestions(sessionId);
        if (cachedQuestions.length > 0 && !body.includeCategories?.length && !body.append) {
          emit({ stage: "questions_cached", message: "已命中上次生成的面试题，无需重复等待", progress: 100 });
          return { success: true, data: { sessionId, questions: cachedQuestions }, requestId: crypto.randomUUID() };
        }

        const questions = await analysisStore.generateAndSaveInterviewQuestions(sessionId, {
          questionCount: body.questionCount,
          includeCategories: body.includeCategories,
          append: body.append,
          onProgress: emit,
        });

        if (!questions.length) {
          throw new Error("面试题生成失败，请重试");
        }

        return { success: true, data: { sessionId, questions }, requestId: crypto.randomUUID() };
      });
    }

    if (body.detailQuestionId) {
      const question = await analysisStore.generateAndSaveInterviewQuestionDetail(sessionId, body.detailQuestionId);
      if (!question) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND", message: "未找到要补全的面试题" }, requestId: crypto.randomUUID() },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        data: { sessionId, question },
        requestId: crypto.randomUUID(),
      });
    }

    const cachedQuestions = await analysisStore.getInterviewQuestions(sessionId);
    if (cachedQuestions.length > 0 && !body.includeCategories?.length && !body.append) {
      return NextResponse.json({
        success: true,
        data: { sessionId, questions: cachedQuestions },
        requestId: crypto.randomUUID(),
      });
    }

    const questions = await analysisStore.generateAndSaveInterviewQuestions(sessionId, {
      questionCount: body.questionCount,
      includeCategories: body.includeCategories,
      append: body.append,
    });

    if (!questions.length) {
      return NextResponse.json(
        { success: false, error: { code: "EMPTY_RESULT", message: "面试题生成失败，请重试" }, requestId: crypto.randomUUID() },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { sessionId, questions },
      requestId: crypto.randomUUID(),
    });
  } catch (err) {
    console.error("interview-questions generation failed:", err);
    return NextResponse.json(
      { success: false, error: { code: "LLM_ERROR", message: err instanceof Error ? err.message : "面试题生成失败，请重试" }, requestId: crypto.randomUUID() },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const questions = await analysisStore.getInterviewQuestions(sessionId);

  return NextResponse.json({
    success: true,
    data: { sessionId, questions },
    requestId: crypto.randomUUID(),
  });
}
