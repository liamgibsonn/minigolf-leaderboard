import { DurableObject } from 'cloudflare:workers';

// Holds all games, scores and the best-rounds list. Filled in as we build.
export class Course extends DurableObject {
  async fetch(request) {
    return Response.json({ ok: true });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const course = env.COURSE.get(env.COURSE.idFromName('main'));
      return course.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
