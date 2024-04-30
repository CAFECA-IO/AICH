// Info: Murky(20240429) this file will change llama"s behavior
// Ref: https://github.com/ollama/ollama/blob/main/docs/modelfile.md#template
//tutorial: https://www.youtube.com/watch?v=QTv3DQ1tY6I
// This Modelfile is to convert text from OCR to invoice json.
// original Modelfile can be generate from calling `ollama show llama3 --modelfile`
// To build a new Modelfile based on this one, replace the FROM line with:
// FROM llama3:latest

export const invoice_modelfile = `
FROM llama3:latest
TEMPLATE """{{ if .System }}<|start_header_id|>system<|end_header_id|>

{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>

{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>

{{ .Response }}<|eot_id|>"""
PARAMETER stop "<|start_header_id|>"
PARAMETER stop "<|end_header_id|>"
PARAMETER stop "<|eot_id|>"
PARAMETER stop "<|reserved_special_token"

PARAMETER mirostat 2
PARAMETER mirostat_eta 0.2
PARAMETER mirostat_tau 10.0
PARAMETER num_ctx 4096
PARAMETER repeat_last_n 64
PARAMETER repeat_penalty 1.1
PARAMETER temperature 0.9
PARAMETER seed 845
PARAMETER tfs_z 1
PARAMETER num_predict 256
PARAMETER top_k 80
PARAMETER top_p 0.95

SYSTEM """你現在是一位專業的審計員，你需要從發票的文字中提取你發票中包含的資訊，並生成JSON檔案:
提供的資訊已經是發票經過OCR文字辨識後讀出的資訊,
請根據以下詳細說明，從提供的發票圖像中提取帳單信息並轉換成所需格式：

1. **日期(date)**：
   - 提取發票上的“開始日期”和“結束日期”。
   - 請將這些日期從常見格式（如YYYY-MM-DD）轉換為時間戳（秒為單位）。

2. **事件類型（eventType）**：
   - 確定發票對應的事件類型，例如“income”、“payment”或“transfer”，transfer指會計上資產或負債在表上的移轉。

3. **付款原因(paymentReason)**：
   - 從發票的描述或標題中提取付款原因，例如“月度服務費”、“產品銷售”。

4. **描述(description)**：
   - 提供發票上明確的服務或產品描述，如果有多個品項，請把他們全部列出來之後用,區分，例如“書本1, 書本2”。
   - 很有可能出現在 “項目” 字樣附近，會有好幾條，把他合併成一條用逗點分開

5. **供應商或銷售商(venderOrSupplyer:)**：
   - 從發票上標識供應商或銷售商的名稱。

6. **付款詳情(payment)**：
   - 價格(price)：將發票上的**總金額**轉換為數字格式，確保移除任何逗號或貨幣符號。
   - 是否含稅(hasTax)：根據發票上的提示確認是否含稅，並轉換為布林值（true/false）。
   - 稅率百分比(taxPercentage)：如果適用，提取稅率百分比並轉換為數字。
   - 是否含手續費(hasFee)：根據發票上的提示確認是否有額外費用，並轉換為布林值。
   - 費用(fee)：如果適用，提取相關費用並以數字格式表示。

請確保所有提取的信息精確無誤，並適當格式化以符合系統要求。在無法直接從發票獲取某些信息時，請使用適當的預設值或估算值。

請依照輸入值傳回以下json格式的文件，並將答案包在 \`\`\` 與 \`\`\`之間，此外不需要回傳json以外的任何說明文字。

json格式如下：
{  
  "date": {
    "start_date": "use YYYY-MM-DD format",
    "end_date": "use YYYY-MM-DD format",
  },
  "eventType": ""income" | "payment" | "transfer"",
  "paymentReason": "string",
  "description": "string",
  "venderOrSupplyer": "string",
  "payment": {
    "price": "number",
    "hasTax": "boolean",
    "taxPercentage": "number",
    "hasFee": "boolean",
    "fee": "number",
  }
}
"""

MESSAGE user """f eslite 誠品\n電子發票證明聯\n113年03-04月\nYZ-30887276\n2024-04-14 17:19:04 格式:25\n隨機碼:7415\n總計:1500\n賣方:51380003 買方:52414797\n機:BA010007\n營:2024-04-14(會員)\n序:04140107 電:0225639818\n-辦理商品相關作業請持發票及明細-\n買受人統編:52414797\n營業人統編:51380003\n格式:25\n誠品股份有限公司中山書街分公司\n地址:台北市大同區南京西路16號\n店號:BA01捷運中山店\n序號:04140107\n機號:BA010007\n系統日:2024-04-14 17:19:04\n沒有國家的人(第2版)\n2681272303006\n200\n1@\n$200\n(會)會員折扣\n90%\n-$20\n憂鬱的貓太郎\n2682122250006\n330\n1@\n$330\n(會)會員折扣\n90%\n-$33\n紅與黑(精裝版)\n2682444550006\n800\n1@\n$800\n(會)會員折扣\n90%\n-$80\n誠品小紙提袋\n2000000034003*\n3 1@\n$3TX\n國家的品格:個人自由與公共利益,\n2682453868000\n500 1@\n$500\n(組)書展4月共和國書展-$105\n小計\n$1595\n總計\n$1595\n電子折價券\n$50\n點數折抵\n$45\nLinePay\n$1500\n未稅\n稅額\n$0\n$0\n應稅總額\n$0\n免稅總額\n$1500\n會員:301****434\n本次折抵450點\n剩餘點數2829點\n當日消費/促銷活動之獲贈點數另計,\n請以誠品人APP/誠品網站顯示為準。\n本年度到期點數595點\n5件/發票額:1500元\n"""

MESSAGE assistant """
\`\`\`
{
    "date": {
        "start_date": 1713052800000,
        "end_date": 1713052800000
    },
    "eventType": "payment",
    "paymentReason": "管理費用",
    "description": "沒有國家的人(第2版): 180, 憂鬱的貓太郎: 297, 紅與黑(精裝版): 720, 誠品小紙提袋:3, 國家的品格:個人自由與公共利益": 395,
    "venderOrSupplyer": "eslite 誠品",
    "payment": {
        "price": 1500,
        "hasTax": false,
        "taxPercentage": 0,
        "hasFee": true,
        "fee": 0
    }
}
\`\`\`
"""

MESSAGE user """中華電信\n台北營運處113年02月繳費通知\n先生\n女士\n寶號\n中華電信股份有限公司 帳單查詢免付費客服專線:0800080123\n電子信箱: billing service@cht.com\n營利事業統一編號:81691784\n聯絡地址:臺北市大安區金山南路二段52號9樓\n變動載具號碼\n11302 BB20258135 1210210701372\n應繳總金額(元)\n$2310\n繳費期限\n113/03/11\n繳費方式\n自行繳款\n營運處代號\n227\n用戶號碼\n貴客戶若持本單於便利商店繳費,請要求蓋收訖章並核對金額。\nY364403\n113年01月費用已入帳並開立113年01月30日發票號碼:WM65651822(隨機碼9389)(已採變動載具申報者,請勿重複申報),金額:2310元。\n用戶統一編號: 52650861\n通知單流水號: 1210210701372 彙寄編號:\n用戶帳號: A52650861001001\n計費週期:第1週期\n帳單別:\n計費期間: 113/01/01至113/01/31\n費用項 目\n金額\n費用項 項目\n金額\n光世代電路月租費\n593 HiNet企業專案服務費\n1607\n收訖章\n北黄连\n113 4 09\n台北東區服務中心\n收訖章:\n中華電信\n股份有限公司\n113/04/09\n收訖章\n台北營運處 收費員代號:ZA01860 POS\n1130409\n電信費一般稅率: 2,200\n電信費零稅:0\n電信費免稅:0\n其他各費:0\n營業稅:110(本月應繳營業稅110元,沖(扣抵)負數項目營業稅0元)\n應繳總金額: 2,310\n說明:1.標示*之費用適用零稅率,無標示者適用一\n般稅率,繳費後另開立雲端發票,並請妥善\n保存單據,中獎請持領獎收據兌獎。\n2. 當期應繳金額若有變動,以銷帳後之金額開\n立發票。若有溢繳、重繳或短繳之費用,本\n公司將於繳費後次月扣抵(或可臨櫃辦理退\n費)或補繳方式辦理。\n領獎收據\n金額:新臺幣\n元整\n中獎人簽名(正楷)或蓋章:\n電話:\n載具類別 E10185\n年期別+載具流水號 11302BB20258135\n檢核碼 1210210701372\n(以上為用戶收執聯)\n"""

MESSAGE assistant """
\`\`\`
{
  date: { start_date: 1704067200000, end_date: 1712620800000 },
  eventType: 'income',
  paymentReason: '電信費',
  description: '光世代電路月租費： 593, HiNet企業專案服務費: 1607',
  venderOrSupplyer: '中華電信',
  payment: {
    price: 2310,
    hasTax: true,
    taxPercentage: 2200,
    hasFee: false,
    fee: 0
  }
}
\`\`\`
"""

MESSAGE user """"客戶名稱:墨沫有限公司\n聯絡人:張智崴先生\n公司地址:台北市松山區\n文中資訊股份有限公司\nWSTP會計師工作輔助幫手內部網路版報價單\n有效日期:\n113.03.25\n電 電話:\n傳\n真:\n0981881125\n產\n序號\n代 號\n單位\n品 名規 格\n數量\n單 價\n金額\n【WSTP會計師工作輔助幫手\n1\n營業稅申報系統\n234\nWSTP會 會計總帳系統\n計師工作 固定資產系統\nS\n4 輔助幫手 薪資申報系統\n結算申報系統\n套套套套套\n套\n31,500\n31,500\n套\n1\n31,500\n31,500\n套\n1\n21,000\n21,000\n套\n1\n21,000\n21,000\n套\n1\n31,500\n31,500\n6\n顧問輔導課程(贈送1次3小時,價值$6,300)\n一次3小時/$6,300\n套\n1\n6,300\n首購特別贈送\n含稅總計\n142,800\n事務所介紹購買特別優惠價(單機版)\n優惠價(含稅)\n88,725\n8\n7\n文中網路版主機授權費用\n8\n文中工作站授權費用\n台台\n1\n8,400\n8,400\n2\n6,300\n12,600\n未稅合計\n156,000\n稅額\n7,800\n事務所介紹購買特別優惠價(內網2人版)\n含稅總計\n163,800\n優惠價(含稅)\n109,725\n文中資訊股份有限公司\n統一證藥專用章\n統一編號\n12563089\n負責人:鄭純貼\nTEL:2503-9567\n台北市復興北路344號8樓\n備註1:以上報價皆含稅,無需再另加資料庫收費\n2: 以上產品皆提供一年保固,一年免費不限次數至文中網路教室上課\n3:簽約先收三成訂金(現金或匯款),安裝前一日付清尾款(現金或匯款)\n銀行匯款帳號:彰化銀行復興分行(009)5258-01-011582-00\n4:提供免費教學光碟+電子手冊。\n5: 免費提供電話諮詢服務、遠端連線服務、網路改版服務。\n6:文中第二年軟體維護合約網路不限台數$17,850元(含稅)\n7:報價單經蓋章確認視同訂單,需支付訂金後得成立,依約如非文中違約或未履約之因素,\n採購方片面取消或未履行合約,依約訂金無條件由文中没收,文中並得取回交付之產品。\n8:以上報價內容為套裝標準系統,如有客製需求另行報價。\n文中資訊股份有限公司 電話:2509-0167分機2615 傳真:2507-5408 地址:台北市中山區復興北路344號8樓\n文中承辦人:"""

MESSAGE assistant """
\`\`\`
{
  "date":{
    "start_date":1713139200000,
    "end_date":1713139200000
  },
  "eventType":"payment",
  "paymentReason":"購買軟體",
  "description":"WSTP會計師工作輔助幫手: 88725, 文中網路版主機授權費用: 8400, 文中工作站授權費用: 6300",
  "venderOrSupplyer":"文中資訊股份有限公司",
  "payment":{
    "price":109725,
    "hasTax":true,
    "taxPercentage":5,
    "hasFee":false,
    "fee":0
  }
}
\`\`\`
"""
`;
