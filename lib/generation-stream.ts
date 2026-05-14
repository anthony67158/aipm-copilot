import type { GenerationProgressEvent } from "@/types/api";

type ProgressInput = Omit<GenerationProgressEvent, "type" | "operation">;

export function wantsEventStream(request: Request) {
  return request.headers.get("accept")?.includes("text/event-stream");
}

export function createGenerationStream(
  operation: GenerationProgressEvent["operation"],
  run: (emit: (event: ProgressInput) => void) => Promise<unknown>,
) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: GenerationProgressEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      void run((event) => {
        send({ ...event, type: "progress", operation });
      })
        .then((data) => {
          send({
            type: "done",
            operation,
            stage: "done",
            message: "生成完成",
            progress: 100,
            data,
          });
          closed = true;
          controller.close();
        })
        .catch((err) => {
          send({
            type: "error",
            operation,
            stage: "error",
            message: err instanceof Error ? err.message : "生成失败，请重试",
            progress: 100,
          });
          closed = true;
          controller.close();
        });
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
