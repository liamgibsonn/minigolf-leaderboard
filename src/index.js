export { Course } from './course.js';

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
