"use client";

/** Gönderilemeyen e-postayı yeniden kuyruğa alır ve hemen göndermeyi dener. */

import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

export default function EmailRequeueButton({ emailId }: { emailId: string }) {
  const { busy, error, done, send } = useAdminRequest();
  return (
    <span className={f.actions}>
      <button type="button" className={f.link} disabled={busy} onClick={() => void send(`/api/admin/emails/${emailId}/requeue`, {}, { success: "Kuyruğa alındı." })}>
        {busy ? "…" : "Yeniden gönder"}
      </button>
      {error && <span className={f.error}>{error}</span>}
      {done && <span className={f.ok}>{done}</span>}
    </span>
  );
}
