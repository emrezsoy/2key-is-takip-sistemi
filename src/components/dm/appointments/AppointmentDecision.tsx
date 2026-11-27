"use client";

import { useState } from "react";
import { decideAppointmentAction } from "@/lib/actions/dmModules";
import { useAction } from "../useAction";
import { Feedback } from "../Feedback";
import { btnSecondary, inputCls } from "../ui";

export function AppointmentDecision({ id }: { id: string }) {
  const [alt, setAlt] = useState("");
  const { pending, error, info, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => run(() => decideAppointmentAction(id, "CONFIRM"), "Onaylandı; kişiye bildiriliyor.")} className={btnSecondary}>Onayla</button>
      <button type="button" disabled={pending} onClick={() => run(() => decideAppointmentAction(id, "REJECT"), "Reddedildi.")} className={btnSecondary}>Reddet</button>
      <input type="datetime-local" value={alt} onChange={(e) => setAlt(e.target.value)} className={`${inputCls} w-52`} />
      <button type="button" disabled={pending || !alt} onClick={() => run(() => decideAppointmentAction(id, "PROPOSE", alt), "Alternatif önerildi.")} className={btnSecondary}>Alternatif öner</button>
      <Feedback error={error} info={info} />
    </div>
  );
}
