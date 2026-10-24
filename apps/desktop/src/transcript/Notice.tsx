import type { NoticeRow } from "../conversations/transcript.ts";

/** Something that happened around the answer, named in bold, in the notice color or, for a failure, the alarm's. */
export function Notice({ notice }: { notice: NoticeRow }) {
  return (
    <p className={notice.tone === "danger" ? "text-ui text-danger" : "text-ui text-notice"}>
      <span className="font-bold">{notice.name}</span> · {notice.text}
    </p>
  );
}
