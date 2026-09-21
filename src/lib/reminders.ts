import { useEffect } from 'react';
import { useStore } from '../data/store';
import { prefs } from './local';
import { dayKey, startOfWeek } from './time';

/**
 * Optional, quiet notifications.
 *
 * Nothing sensitive ever goes in a notification body - no difficulty, no
 * trigger, no note. A lock screen only ever says that something is waiting
 * in the app, never what it is.
 */

export function notificationsAvailable(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsAvailable() ? Notification.permission : 'unsupported';
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsAvailable()) return 'unsupported';
  return Notification.requestPermission();
}

function notify(title: string, body: string, tag: string): void {
  if (!notificationsAvailable() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag, icon: '/icon.svg', silent: true });
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

export function useReminders(): void {
  const store = useStore();

  useEffect(() => {
    const check = () => {
      if (!store.family) return;

      if (prefs.get('notifyOpenMoment', true)) {
        const cutoff = Date.now() - 30 * 60 * 1000;
        const openOnes = Object.values(store.events).filter(
          (e) => !e.deleted_at && e.status === 'draft' && new Date(e.start_time).getTime() < cutoff
        );
        const alreadyTold = prefs.get<string[]>('remindedDrafts', []);
        openOnes.forEach((e) => {
          if (alreadyTold.includes(e.id)) return;
          notify(
            'Moments',
            'Would you like to finish the moment you started earlier?',
            `open-${e.id}`
          );
          prefs.set('remindedDrafts', [...alreadyTold, e.id].slice(-30));
        });
      }

      if (prefs.get('notifyWeekly', false)) {
        const week = dayKey(startOfWeek(new Date()));
        const told = prefs.get<string | null>('weeklyNotified', null);
        const isMondayOrLater = new Date().getDay() === 1;
        if (isMondayOrLater && told !== week) {
          notify('Moments', 'Your weekly summary is ready.', `weekly-${week}`);
          prefs.set('weeklyNotified', week);
        }
      }
    };

    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [store.events, store.family]);
}

/** True when a moment was started and never finished. */
export function openDrafts(events: Record<string, { status: string; deleted_at: string | null; id: string; start_time: string }>) {
  return Object.values(events)
    .filter((e) => !e.deleted_at && e.status === 'draft')
    .sort((a, b) => b.start_time.localeCompare(a.start_time));
}
