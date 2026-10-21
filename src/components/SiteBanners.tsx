import { useModeration } from '../ModerationContext';
import { useAnnouncement, useNow } from '../lib/moderation';
import { isPermanent, remainingText } from '../lib/moderationLogic';

/** Объявление сайта и сообщение о действующем ограничении аккаунта. Показывается над всем содержимым. */
export default function SiteBanners() {
  const announcement = useAnnouncement();
  const { sanction, banned } = useModeration();
  const now = useNow();
  return (
    <>
      {announcement && (
        <div className={`site-banner ${announcement.level}`}>
          {announcement.level === 'warning' ? '⚠️' : '📢'} {announcement.text}
        </div>
      )}
      {sanction && (
        <div className="site-banner danger">
          {banned ? '⛔ Ваш аккаунт заблокирован' : '🔇 Вам отключён чат'} ({remainingText(sanction.until, now)}).
          {sanction.reason && <> Причина: {sanction.reason}.</>}
          {banned && !isPermanent(sanction) && ' Игры и запросы станут доступны после окончания срока.'}
        </div>
      )}
    </>
  );
}
