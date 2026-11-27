/** `/api/upload/<işlem>` ile yapılabilen yükleme işlemleri (bkz. src/app/api/upload/[action]/route.ts). */
export type UploadAction =
  | "addTaskAttachments"
  | "submitTaskFile"
  | "replaceSubmissionFiles"
  | "createClientJob"
  | "createTask"
  | "addContentItemFiles"
  | "uploadContentImage"
  | "createClientRequest"
  | "createSharePost"
  | "updateSharePost"
  | "reviseDelivery"
  | "teamReviseDelivery"
  | "reviseTaskAnnotated"
  | "createProposal"
  | "addProposalFile"
  | "updateAvatar";
