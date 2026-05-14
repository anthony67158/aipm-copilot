export type Id<T extends string> = string & { readonly __brand: T };

export type UserId = Id<"UserId">;
export type AnalysisSessionId = Id<"AnalysisSessionId">;
export type DiagnosisResultId = Id<"DiagnosisResultId">;
export type OptimizationResultId = Id<"OptimizationResultId">;
export type ResumeVersionId = Id<"ResumeVersionId">;
export type ExportJobId = Id<"ExportJobId">;
export type PaymentOrderId = Id<"PaymentOrderId">;

export type ISODateTimeString = string;

export type UserStatus = "ACTIVE" | "DISABLED";

export type ApplicationType = "campus" | "internship" | "social";

export type UserIdentity = "career_changer" | "fresh_graduate";

export type CurrentRole =
  | "product_manager"
  | "operation"
  | "developer"
  | "data_analyst"
  | "designer"
  | "other";

export type RoleSpecialty = string;

export type RecommendationLevel = "recommended" | "cautious" | "not_recommended";

export type DimensionGap = "met" | "close" | "insufficient";

export type AIPMDimensionId =
  | "ai_understanding"
  | "product_design"
  | "data_driven"
  | "project_execution"
  | "business_sense"
  | "ai_application"
  | "communication";

export type DimensionLevel = 0 | 1 | 2 | 3;

export type InterviewQuestionCategory =
  | "experience_probe"
  | "aipm_professional"
  | "scenario_design"
  | "behavioral"
  | "career_switch_motivation";

export type AnalysisStatus =
  | "PENDING"
  | "PROCESSING"
  | "ANALYZED"
  | "OPTIMIZING"
  | "OPTIMIZED"
  | "FAILED";

export type RewriteMode = "conservative" | "balanced" | "aggressive";

export type ResumeModuleKey =
  | "profile"
  | "summary"
  | "education"
  | "project"
  | "internship"
  | "campusExperience"
  | "skills"
  | "awards"
  | "certifications";

export type RiskType =
  | "BULLET_TOO_GENERIC"
  | "MISSING_KEYWORDS"
  | "WEAK_QUANTIFICATION"
  | "STRUCTURE_ISSUE"
  | "LOW_RELEVANCE"
  | "UNCLEAR_ROLE_SCOPE";

export type ExportFormat = "txt" | "pdf" | "docx";

export type ExportStatus = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";

export type PlanType = "FREE" | "SINGLE" | "MEMBER";

export type PaymentOrderStatus =
  | "CREATED"
  | "PAYING"
  | "PAID"
  | "CANCELED"
  | "REFUNDED"
  | "FAILED";

export type PaymentChannel = "alipay" | "wechat" | "stripe";

export type ProductCode = "single_report" | "single_optimize" | "weekly_pass" | "monthly_member";

export type APIErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "PAYMENT_REQUIRED"
  | "AI_PROCESSING_FAILED"
  | "INTERNAL_SERVER_ERROR";

export interface APIError {
  code: APIErrorCode;
  message: string;
  details?: unknown;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ErrorResponse {
  success: false;
  error: APIError;
  requestId: string;
}

export type APIResponse<T> = SuccessResponse<T> | ErrorResponse;

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: Pagination;
}

export interface User {
  id: UserId;
  email: string | null;
  phone: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface AnalysisSession {
  id: AnalysisSessionId;
  userId: UserId | null;
  status: AnalysisStatus;
  resumeText: string;
  resumeFileUrl: string | null;
  jobDescriptionText: string;
  jobTitle: string | null;
  jobCategory: string | null;
  applicationType: ApplicationType | null;
  focusModules: ResumeModuleKey[];
  failureReason: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface DiagnosisRisk {
  type: RiskType;
  message: string;
}

export interface DiagnosisResult {
  id: DiagnosisResultId;
  sessionId: AnalysisSessionId;
  matchScore: number;
  summary: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  risks: DiagnosisRisk[];
  recommendations: string[];
  modelVersion: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface OptimizedSection {
  sectionKey: ResumeModuleKey;
  sectionLabel: string;
  originalText: string;
  optimizedText: string;
  explanation: string;
}

export interface OptimizationResult {
  id: OptimizationResultId;
  sessionId: AnalysisSessionId;
  beforeScore: number | null;
  afterScore: number | null;
  rewriteMode: RewriteMode;
  selectedModules: ResumeModuleKey[];
  optimizedSections: OptimizedSection[];
  fullOptimizedResumeText: string;
  modelVersion: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface ResumeVersion {
  id: ResumeVersionId;
  userId: UserId;
  sessionId: AnalysisSessionId;
  title: string;
  jobTitle: string | null;
  jobCategory: string | null;
  sourceType: "original" | "optimized" | "manual_edit";
  resumeText: string;
  isArchived: boolean;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface ExportJob {
  id: ExportJobId;
  userId: UserId;
  sourceType: "resumeVersion" | "analysisResult";
  sourceId: ResumeVersionId | AnalysisSessionId;
  format: ExportFormat;
  status: ExportStatus;
  fileUrl: string | null;
  failureReason: string | null;
  expiredAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface Entitlements {
  isLoggedIn: boolean;
  planType: PlanType;
  remainingFreeDiagnoses: number;
  remainingOptimizeCredits?: number;
  canExport: boolean;
}

export interface PaymentOrder {
  id: PaymentOrderId;
  userId: UserId;
  sessionId: AnalysisSessionId | null;
  productCode: ProductCode;
  productName: string;
  currency: "CNY";
  amountTotal: number;
  amountPaid: number;
  status: PaymentOrderStatus;
  paidAt: ISODateTimeString | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface ReportHistoryItem {
  sessionId: AnalysisSessionId;
  jobTitle: string | null;
  targetCompany: string | null;
  recommendationLabel: string | null;
  overallMatchScore: number | null;
  oneLiner: string | null;
  status: AnalysisStatus;
  isPaid: boolean;
  hasRewrite: boolean;
  interviewQuestionCount: number;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface CreateAnalysisSessionRequest {
  resumeText: string;
  resumeFileUrl?: string;
  jobDescriptionText: string;
  jobTitle?: string;
  jobCategory?: string;
  applicationType?: ApplicationType;
  focusModules?: ResumeModuleKey[];
}

export interface CreateAnalysisSessionResponse {
  sessionId: AnalysisSessionId;
  status: AnalysisStatus;
  createdAt: ISODateTimeString;
}

export interface GetAnalysisSessionResponse {
  sessionId: AnalysisSessionId;
  status: AnalysisStatus;
  progress?: number;
  failureReason?: string | null;
}

export interface GetDiagnosisResponse {
  sessionId: AnalysisSessionId;
  matchScore: number;
  summary: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  risks: DiagnosisRisk[];
  recommendations: string[];
}

export interface RewriteAnalysisSessionResponse {
  sessionId: AnalysisSessionId;
  status: AnalysisStatus;
}

export interface UploadResumePdfResponse {
  fileName: string;
  extractedText: string;
  pageCount: number;
  extractionMethod: "text" | "ocr";
  savedFileId?: string;
}

export interface PolishResumeTextRequest {
  resumeText: string;
}

export interface PolishResumeTextResponse {
  polishedText: string;
  modelVersion: string;
  mode: "llm" | "fallback";
}

export interface CreateResumeVersionRequest {
  sessionId: AnalysisSessionId;
  title: string;
  rewrittenResumeText?: string;
}

// ------------------------------
// Legacy Compatibility Region
// ------------------------------
// Keep old names here only for backward compatibility.
// New code should prefer rewrite-based names and routes.

export type OptimizeAnalysisSessionRequest = TriggerRewriteRequest;

export type OptimizeAnalysisSessionResponse = RewriteAnalysisSessionResponse;

export type GetOptimizationResultResponse = GetRewriteResultResponse;

export interface LegacyCreateResumeVersionRequestFields {
  optimizedResumeText?: string;
}

export type CreateResumeVersionRequestCompat = CreateResumeVersionRequest & LegacyCreateResumeVersionRequestFields;

export interface CreateResumeVersionResponse {
  version: ResumeVersion;
}

export interface ListResumeVersionsQuery {
  page?: number;
  pageSize?: number;
  isArchived?: boolean;
}

export interface ListResumeVersionsResponse {
  items: ResumeVersion[];
  pagination: Pagination;
}

export interface ListReportHistoryResponse {
  items: ReportHistoryItem[];
  pagination: Pagination;
}

export interface UpdateResumeVersionRequest {
  title?: string;
  resumeText?: string;
  isArchived?: boolean;
}

export interface UpdateResumeVersionResponse {
  version: ResumeVersion;
}

export interface CreateExportJobRequest {
  sourceType: "resumeVersion" | "analysisResult";
  sourceId: ResumeVersionId | AnalysisSessionId;
  format: ExportFormat;
}

export interface CreateExportJobResponse {
  exportId: ExportJobId;
  status: ExportStatus;
}

export interface GetExportJobResponse {
  exportId: ExportJobId;
  status: ExportStatus;
  downloadUrl?: string;
  failureReason?: string | null;
}

export interface GetMeResponse {
  user: User | null;
}

export interface AuthRequest {
  nickname: string;
  password: string;
}

export interface AuthResponse {
  user: User;
}

export interface GetEntitlementsResponse extends Entitlements {}

export interface UserProfile {
  identity: UserIdentity;
  currentRole: CurrentRole;
  roleSpecialty?: RoleSpecialty;
  yearsOfExperience?: number;
}

export interface DimensionAnalysis {
  dimensionId: AIPMDimensionId;
  dimensionLabel: string;
  requiredLevel: DimensionLevel;
  currentLevel: DimensionLevel;
  gap: DimensionGap;
  evidence: string;
  remedyActions: string[];
}

export interface InterviewRoundPrediction {
  resumeScreening: { passRate: string; risk: string };
  firstRound: { likelyQuestions: string[]; weakness: string };
  secondRound: { likelyQuestions: string[]; weakness: string };
  hrRound: { risk: string };
}

export interface PlanAction {
  dayRange: string;
  title: string;
  reasonHook: string;
  steps: string[];
  deliverable: string;
  acceptance: string;
  resources?: string[];
  templateSnippet?: string;
  targetDimension: AIPMDimensionId;
  action?: string;
}

export interface TwoWeekPlan {
  week1: PlanAction[];
  week2: PlanAction[];
}

export interface DecisionReport {
  sessionId: AnalysisSessionId;
  recommendation: RecommendationLevel;
  recommendationLabel: string;
  oneLiner: string;
  overallMatchScore: number;
  dimensions: DimensionAnalysis[];
  interviewRoundPrediction: InterviewRoundPrediction;
  twoWeekPlan: TwoWeekPlan;
}

export interface RewriteSection {
  sectionKey: string;
  sectionLabel: string;
  originalText: string;
  rewrittenText: string;
  explanation: string;
  targetDimensions: AIPMDimensionId[];
}

export interface AIPMTerm {
  term: string;
  explanation: string;
}

export interface RewriteFactGuardIssue {
  code:
    | "NEW_NUMERIC_FACT"
    | "NEW_ENGLISH_TERM"
    | "NEW_PROPER_NOUN"
    | "ROLE_TITLE_DRIFT"
    | "SECTION_DOMAIN_DRIFT";
  message: string;
  examples: string[];
  sectionLabel?: string;
}

export interface RewriteFactGuard {
  status: "passed" | "repaired" | "risky" | "fallback";
  summary: string;
  issues: RewriteFactGuardIssue[];
}

export interface RewriteResult {
  sessionId: AnalysisSessionId;
  beforeScore: number;
  afterScore: number;
  rewriteStrategy: string;
  sections: RewriteSection[];
  fullRewrittenText: string;
  aipmTermsHighlighted: AIPMTerm[];
  factGuard: RewriteFactGuard;
}

export interface InterviewQuestionItem {
  id: string;
  category: InterviewQuestionCategory;
  question: string;
  whyAsked: string;
  answerFramework: string;
  sampleAnswer: string;
  keyPoints: string[];
  pitfalls: string[];
}

export interface CreateAnalysisSessionRequestV2 {
  resumeText: string;
  jobDescriptionText: string;
  jobTitle?: string;
  userProfile: UserProfile;
}

export interface GetDecisionReportResponse extends DecisionReport {}

export interface TriggerRewriteRequest {
  rewriteMode?: RewriteMode;
  focusDimensions?: AIPMDimensionId[];
}

export interface GetRewriteResultResponse extends RewriteResult {}

export interface GenerationProgressEvent {
  type: "progress" | "done" | "error";
  operation: "decisionReport" | "rewrite" | "interviewQuestions";
  stage: string;
  message: string;
  current?: number;
  total?: number;
  progress?: number;
  data?: unknown;
}

export interface TriggerInterviewQuestionsRequest {
  questionCount?: number;
  includeCategories?: InterviewQuestionCategory[];
  append?: boolean;
  detailQuestionId?: string;
}

export interface GetInterviewQuestionsResponse {
  sessionId: AnalysisSessionId;
  questions: InterviewQuestionItem[];
}

export interface CreatePaymentOrderRequest {
  productCode: ProductCode;
  sessionId?: AnalysisSessionId;
}

export interface CreatePaymentOrderResponse {
  orderId: PaymentOrderId;
  status: PaymentOrderStatus;
  payUrl?: string;
  qrCodeUrl?: string;
}

export interface GetPaymentOrderResponse {
  order: PaymentOrder;
}

export interface ListPaymentOrdersResponse {
  items: PaymentOrder[];
  pagination: Pagination;
}

export interface APIContract {
  "POST /api/v1/analysis-sessions": {
    request: CreateAnalysisSessionRequest;
    response: CreateAnalysisSessionResponse;
  };
  "GET /api/v1/analysis-sessions/:sessionId": {
    request: never;
    response: GetAnalysisSessionResponse;
  };
  "GET /api/v1/analysis-sessions/:sessionId/diagnosis": {
    request: never;
    response: GetDiagnosisResponse;
  };
  "POST /api/v1/analysis-sessions/:sessionId/optimize": {
    request: OptimizeAnalysisSessionRequest;
    response: OptimizeAnalysisSessionResponse;
  };
  "GET /api/v1/analysis-sessions/:sessionId/result": {
    request: never;
    response: GetRewriteResultResponse;
  };
  "GET /api/v1/analysis-sessions/:sessionId/decision-report": {
    request: never;
    response: GetDecisionReportResponse;
  };
  "POST /api/v1/analysis-sessions/:sessionId/rewrite": {
    request: TriggerRewriteRequest;
    response: GetRewriteResultResponse;
  };
  "GET /api/v1/analysis-sessions/:sessionId/rewrite": {
    request: never;
    response: GetRewriteResultResponse;
  };
  "POST /api/v1/analysis-sessions/:sessionId/interview-questions": {
    request: TriggerInterviewQuestionsRequest;
    response: GetInterviewQuestionsResponse;
  };
  "GET /api/v1/analysis-sessions/:sessionId/interview-questions": {
    request: never;
    response: GetInterviewQuestionsResponse;
  };
  "POST /api/v1/uploads/resume-pdf": {
    request: FormData;
    response: UploadResumePdfResponse;
  };
  "POST /api/v1/resume-polish": {
    request: PolishResumeTextRequest;
    response: PolishResumeTextResponse;
  };
  "POST /api/v1/resume-versions": {
    request: CreateResumeVersionRequest;
    response: CreateResumeVersionResponse;
  };
  "GET /api/v1/resume-versions": {
    request: ListResumeVersionsQuery;
    response: ListResumeVersionsResponse;
  };
  "PATCH /api/v1/resume-versions/:versionId": {
    request: UpdateResumeVersionRequest;
    response: UpdateResumeVersionResponse;
  };
  "POST /api/v1/exports": {
    request: CreateExportJobRequest;
    response: CreateExportJobResponse;
  };
  "GET /api/v1/exports/:exportId": {
    request: never;
    response: GetExportJobResponse;
  };
  "GET /api/v1/me": {
    request: never;
    response: GetMeResponse;
  };
  "GET /api/v1/me/entitlements": {
    request: never;
    response: GetEntitlementsResponse;
  };
  "POST /api/v1/payments/orders": {
    request: CreatePaymentOrderRequest;
    response: CreatePaymentOrderResponse;
  };
  "GET /api/v1/payments/orders/:orderId": {
    request: never;
    response: GetPaymentOrderResponse;
  };
  "GET /api/v1/payments/orders": {
    request: never;
    response: ListPaymentOrdersResponse;
  };
}
