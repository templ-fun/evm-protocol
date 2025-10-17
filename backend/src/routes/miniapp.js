import express from 'express';
import { parseWebhookEvent, createVerifyAppKeyWithHub } from '@farcaster/miniapp-node';
import { logger as defaultLogger } from '../logger.js';

export default function miniappRouter(context = {}) {
  const router = express.Router();

  const {
    logger = defaultLogger,
    verifyMiniAppAppKey,
    saveMiniAppNotification = async () => {},
    deleteMiniAppNotification = async () => {},
    deleteMiniAppNotificationsForFid = async () => {}
  } = context;

  const hubUrl = process.env.FARCASTER_HUB_URL?.trim() || 'https://hub-api.neynar.com';
  const hubApiKey = process.env.FARCASTER_HUB_API_KEY?.trim();
  const requestOptions = hubApiKey
    ? { headers: { Authorization: `Bearer ${hubApiKey}` } }
    : undefined;

  const verifyAppKey =
    typeof verifyMiniAppAppKey === 'function'
      ? verifyMiniAppAppKey
      : createVerifyAppKeyWithHub(hubUrl, requestOptions);

  router.post('/miniapp/webhooks', async (req, res) => {
    try {
      const { fid, appFid, event } = await parseWebhookEvent(req.body, verifyAppKey);
      logger.info({ fid, appFid, event: event.event }, 'miniapp webhook received');

      switch (event.event) {
        case 'miniapp_added':
        case 'notifications_enabled': {
          const details = event.notificationDetails;
          if (details?.token && details?.url) {
            await saveMiniAppNotification({
              token: details.token,
              url: details.url,
              fid,
              appFid
            });
          }
          break;
        }
        case 'miniapp_removed': {
          const details = 'notificationDetails' in event ? /** @type {any} */ (event).notificationDetails : null;
          if (details?.token) {
            await deleteMiniAppNotification(details.token);
          }
          await deleteMiniAppNotificationsForFid(fid);
          break;
        }
        case 'notifications_disabled': {
          await deleteMiniAppNotificationsForFid(fid);
          break;
        }
        default:
          break;
      }

      res.json({ ok: true });
    } catch (err) {
      logger?.warn?.({ err: err?.message || err }, 'miniapp webhook processing failed');
      res.status(400).json({ error: 'Invalid webhook payload' });
    }
  });

  return router;
}
