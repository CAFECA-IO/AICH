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
PARAMETER num_predict 256
PARAMETER top_k 80
PARAMETER top_p 0.95

SYSTEM """"""
`;
