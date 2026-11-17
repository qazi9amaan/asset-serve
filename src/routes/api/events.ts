import { createFileRoute } from '@tanstack/react-router'
import { getHub, type HubEvent } from '#/server/hub'

// Server-Sent Events: pushes "registry changed" and "file <id> changed" to the UI.
export const Route = createFileRoute('/api/events')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const enc = new TextEncoder()
        let cleanup = () => {}
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const write = (chunk: string) => {
              try {
                controller.enqueue(enc.encode(chunk))
              } catch {
                cleanup()
              }
            }
            const send = (e: HubEvent) => write(`data: ${JSON.stringify(e)}\n\n`)
            const unsubscribe = getHub().subscribe(send)
            const ping = setInterval(() => write(': ping\n\n'), 15_000)
            write('retry: 1000\n\n')
            cleanup = () => {
              clearInterval(ping)
              unsubscribe()
              try {
                controller.close()
              } catch {
                // already closed
              }
            }
            request.signal.addEventListener('abort', () => cleanup())
          },
          cancel() {
            cleanup()
          },
        })
        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          },
        })
      },
    },
  },
})
