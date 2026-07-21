import { AnalysisFileMenu } from './analysis-file-menu';

export function AnalysisToolbar({
  analysisId,
  onParsed,
}: {
  analysisId: string;
  onParsed?: () => void;
}) {
  return (
    <AnalysisFileMenu
      analysisId={analysisId}
      onParsed={onParsed}
    />
  );
}
