import CalendarPage from '@/app/components/calendar/CalendarPage';

export const metadata = {
  title: 'Calendar — NutJob',
  description: 'Farm calendar for irrigation, fertigation, spraying, pruning, and scouting events.',
};

export default function CalendarRoute() {
  return <CalendarPage />;
}
