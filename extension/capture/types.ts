// Lane 1 -> Lane 2 / Lane 4 handoff. Keep these names in sync with the team plan.
export type CaptureInput = {
  kind: "text" | "file" | "image" | "screenshot";
  text?: string;
  fileBase64?: string;
  imageUrl?: string;
  mimeType?: string;
  pageUrl?: string;
  pageTitle?: string;
};
