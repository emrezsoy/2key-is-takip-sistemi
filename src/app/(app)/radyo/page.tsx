import { auth } from "@/auth";
import { getRadioControls, getRadioQueue, RADIO_MAX_QUEUED_PER_USER, RADIO_SKIP_VOTES } from "@/lib/radio";
import { RadioPanel, type RadioTrackView } from "@/components/radio/RadioPanel";

export const metadata = { title: "Ofis Radyosu | 2 Key idea" };

export default async function RadyoPage() {
  const session = await auth();
  const user = session!.user;
  const isAdmin = user.role === "ADMIN";
  const [{ current, queue, history, skipVoters }, controls] = await Promise.all([getRadioQueue(), getRadioControls()]);

  const view = (t: NonNullable<typeof current>): RadioTrackView => ({
    id: t.id,
    videoId: t.videoId,
    title: t.title,
    channel: t.channel,
    addedById: t.addedById,
    addedByName: t.addedByName,
    status: t.status,
  });

  return (
    <RadioPanel
      me={{ id: user.id, isAdmin }}
      current={current ? view(current) : null}
      queue={queue.map(view)}
      history={history.map(view)}
      skipVotes={skipVoters.length}
      iVoted={skipVoters.includes(user.id)}
      controls={{ paused: controls.paused, volume: controls.volume, tvOnline: controls.tvOnline }}
      // TV bağlantısı sadece yöneticiye gösterilir.
      tvToken={isAdmin ? controls.tvToken : null}
      limits={{ perUser: RADIO_MAX_QUEUED_PER_USER, skipVotes: RADIO_SKIP_VOTES }}
    />
  );
}
