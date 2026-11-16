import type { Request, Response, NextFunction } from 'express';
import { ShareService } from './share.service.js';
import { renderFlyerHtml, renderNotFoundHtml } from './flyerRenderer.js';

export async function handlePublicFlyer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.params.token as string;
    const result = await ShareService.resolvePublicShare(token);

    if (result.status === 404) {
      res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(renderNotFoundHtml(404));
      return;
    }

    if (result.status === 410) {
      res.status(410).set('Content-Type', 'text/html; charset=utf-8').send(renderNotFoundHtml(410));
      return;
    }

    const { property, share } = result;
    const html = renderFlyerHtml(property, share);

    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('X-Robots-Tag', 'noindex, nofollow')
      .send(html);
  } catch (err) {
    next(err);
  }
}

