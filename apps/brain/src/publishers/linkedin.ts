import { register } from './index';
import { linkedinIntegration, refreshIfNeeded, publishPost } from '../lib/linkedin';

register({
  channel: 'linkedin',
  async publish(ctx, c) {
    const i = await linkedinIntegration(ctx.uid); if (!i || !i.enabled) throw new Error('LinkedIn is not connected (Settings → Integrations)');
    await refreshIfNeeded(ctx.uid, i, 3);
    const fresh = (await linkedinIntegration(ctx.uid))!;
    const text = c.body.trim().slice(0, 3000);
    const { urn, url } = await publishPost(ctx.uid, fresh, text);
    return { channel: 'linkedin', id: urn, url, status: 'published' };
  },
});
