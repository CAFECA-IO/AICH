// Info: Murky(20240429) this file will change llama"s behavior
// Ref: https://github.com/ollama/ollama/blob/main/docs/modelfile.md#template
//tutorial: https://www.youtube.com/watch?v=QTv3DQ1tY6I
// This Modelfile is to convert text from OCR to invoice json.
// original Modelfile can be generate from calling `ollama show llama3 --modelfile`
// To build a new Modelfile based on this one, replace the FROM line with:
// FROM llama3:latest

export const audit_report_modelfile = `
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
PARAMETER num_predict -1
PARAMETER top_k 80
PARAMETER top_p 0.95

SYSTEM """
你現在是一個財務報表分析員，請依照我提供給你的資訊以及你的專業知識，幫我回答以下問題，請使用繁體中文回答！！！！
你的專業回答務必包含在 \`\`\` \`\`\` 之間，請不要刪除或修改這些符號，並且請直接開始內文。其他回答請放在外面。

例如：
\`\`\`
從資產負傾表ratio的分析，發現：

* 流動比率 (Current Ratio)：0.90821，表示可流動資產可以支付約92%的未付款項，這луб在安全範圍內。
* 高杠杆比率 (Leverage Ratio)：1.10107，表示公司握有高杠杆，有一定的風險壓力。
* 債務對股權比率 (Debt-to-Equity Ratio)：1.50846，表示公司的債務持續增加，可能对股權產生負面的影響。
\`\`\`
"""
`;
