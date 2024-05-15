import { Injectable, Logger } from '@nestjs/common';
import { AuditReportsHelperService as helper } from '@/api/audit_reports/audit_reports_helper/audit_reports_helper.service';
import { LlamaService } from '@/libs/llama/llama.service';
import { LruCacheService } from '@/libs/lru_cache/lru_cache.service';
import { AuditReport, FinancialStatements } from '@/interfaces/audit_report';
import { BalanceSheet } from '@/interfaces/balance_sheet';
import { ComprehensiveIncome } from '@/interfaces/comprehensive_income';
import { CashFlow } from '@/interfaces/cash_flow';
import { PROGRESS_STATUS } from '@/constants/common';
@Injectable()
export class AuditReportsService {
  private readonly logger = new Logger(AuditReportsService.name);

  constructor(
    private readonly llamaService: LlamaService<string>,
    private readonly cache: LruCacheService<AuditReport>,
  ) {
    this.logger.log('AuditReportsService initialized');
  }

  public generateAuditReport(financialStatements: FinancialStatements): string {
    const idForHash =
      financialStatements.balanceSheet.reportID +
      financialStatements.comprehensiveIncome.reportID +
      financialStatements.cashFlow.reportID;

    const hashedKey = this.cache.hashId(idForHash);
    if (this.cache.get(hashedKey).value) {
      return `Audit report already generated, use resultId: ${hashedKey} to retrieve the result`;
    }

    this.generateAuditReportAsync(hashedKey, financialStatements);
    return hashedKey;
  }

  public getAuditReportAnalyzingStatus(resultId: string): PROGRESS_STATUS {
    const result = this.cache.get(resultId);
    if (!result) {
      return PROGRESS_STATUS.NOT_FOUND;
    }

    return result.status;
  }

  public getAuditReportAnalyzingResult(resultId: string): AuditReport | null {
    const result = this.cache.get(resultId);
    if (!result) {
      return null;
    }

    if (result.status !== PROGRESS_STATUS.SUCCESS) {
      return null;
    }

    return result.value;
  }

  private async generateAuditReportAsync(
    hashedKey: string,
    financialStatements: FinancialStatements,
  ): Promise<void> {
    const { balanceSheet, comprehensiveIncome, cashFlow } = financialStatements;

    let llamaMemory = '';

    // Info Murky(20240505): classify the company's life cycle
    const lifeCycle = helper.classifyLifeCycleStage(financialStatements);
    llamaMemory += `公司生命周期：${lifeCycle}\n`;

    // Info Murky(20240505): generate ratios for each report
    const balanceSheetRatios =
      helper.generateBalanceSheetRatio(financialStatements);

    const comprehensiveIncomeRatios =
      helper.generateIncomeStatementRatio(financialStatements);

    const cashFlowRatios = helper.generateCashFlowRatio(financialStatements);

    // Info Murky(20240505): generate analysis for each report
    const balanceSheetAnalysis =
      await this.generateSingleReportAnalysis<BalanceSheet>(
        balanceSheet,
        balanceSheetRatios,
        '請依照以下提供的資產負債表與資產負債表ratio產生 資產負債表分析',
      );
    llamaMemory += `資產負債表:${JSON.stringify(balanceSheet)}\n資產負債表ration:${JSON.stringify(balanceSheetRatios)}\n資產負債表分析：${balanceSheetAnalysis}\n`;

    const comprehensiveIncomeAnalysis =
      await this.generateSingleReportAnalysis<ComprehensiveIncome>(
        comprehensiveIncome,
        comprehensiveIncomeRatios,
        '請依照以下提供的綜合損益表與綜合損益表ratio產生 綜合損益表分析',
      );
    llamaMemory += `綜合損益表:${JSON.stringify(comprehensiveIncome)}\n綜合損益表ration:${JSON.stringify(comprehensiveIncomeRatios)}\n綜合損益表分析：${comprehensiveIncomeAnalysis}\n`;

    const cashFlowAnalysis = await this.generateSingleReportAnalysis<CashFlow>(
      cashFlow,
      cashFlowRatios,
      '請依照以下提供的現金流量表與現金流量表ratio產生 現金流量表分析',
    );
    llamaMemory += `現金流量表:${JSON.stringify(cashFlow)}\n現金流量表ration:${JSON.stringify(cashFlowRatios)}\n現金流量表分析：${cashFlowAnalysis}\n`;

    // Info Murky(20240505): generate financial statements analysis
    const financialStatementsAnalysis =
      await this.llamaService.genetateResponseLoop(
        `以下是之前提供的資產負債表、綜合損益表、現金流量表分析資訊，請依據這些資訊幫整份財務報表做分析，資料如下\n${llamaMemory}`,
      );
    llamaMemory += `整份財務報表分析：${financialStatementsAnalysis}\n`;

    // Info Murky(20240505): generate credit rating
    const creditRating = await this.llamaService.genetateResponseLoop(
      `請依照你剛才為公司做的分析，幫公司進行信用評等, 資料如下\n：${llamaMemory}`,
    );
    llamaMemory += `信用評等：${creditRating}\n`;

    // Info Murky(20240505): generate summary
    const summary = await this.llamaService.genetateResponseLoop(
      `請依照你剛才為公司做的分析，幫公司財務狀況做總結, 資料如下\n：${llamaMemory}`,
    );

    const report: AuditReport = {
      balanceSheet: {
        balanceSheet,
        balanceSheetRatios,
        balanceSheetAnalysis,
      },
      comprehensiveIncome: {
        comprehensiveIncome,
        comprehensiveIncomeRatios,
        comprehensiveIncomeAnalysis,
      },
      cashFlow: {
        cashFlow,
        cashFlowRatios,
        cashFlowAnalysis,
      },
      lifeCycle,
      creditRating,
      financialStatementsAnalysis,
      summary,
    };

    this.cache.put(hashedKey, PROGRESS_STATUS.SUCCESS, report);
  }

  private async generateSingleReportAnalysis<T>(
    report: T,
    ratios: { [key: string]: number },
    prompt: string,
  ): Promise<string> {
    const reportString = JSON.stringify(report);
    const ratiosString = JSON.stringify(ratios);

    const promptForLLama = `${prompt}\n 報表資訊： ${reportString} \n 報表比率分析： ${ratiosString}`;
    const result = this.llamaService.genetateResponseLoop(promptForLLama);
    return result;
  }
}
