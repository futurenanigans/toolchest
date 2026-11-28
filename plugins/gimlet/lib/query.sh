# shellcheck shell=bash
# Query and filter merged gimlet findings, with text, JSON, and SARIF 2.1.0 output.

cmd_query() {
  local target="" severity="" tool="" rule="" path_substr="" format="text"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --severity) severity="${2:?--severity needs a comma-separated list}"; shift 2 ;;
      --tool) tool="${2:?--tool needs a comma-separated list}"; shift 2 ;;
      --rule) rule="${2:?--rule needs a comma-separated list}"; shift 2 ;;
      --path) path_substr="${2:?--path needs a path substring}"; shift 2 ;;
      --format) format="${2:?--format needs text, json, or sarif}"; shift 2 ;;
      -h|--help)
        echo "usage: gimlet query [REPORT_JSON|RESULTS_DIR] [--severity LIST] [--tool LIST] [--rule LIST] [--path SUBSTR] [--format text|json|sarif]"
        return 0
        ;;
      -*) die "query: unknown option $1" ;;
      *)
        [[ -z "$target" ]] || die "query: unexpected extra argument $1"
        target="$1"; shift
        ;;
    esac
  done

  case "$format" in
    text|json|sarif) ;;
    *) die "query: unsupported --format '$format' (expected text, json, or sarif)" ;;
  esac

  local report_file=""
  if [[ -z "$target" ]]; then
    if [[ -f "report.json" ]]; then
      report_file="report.json"
    else
      die "query: specify a report.json file or results directory"
    fi
  elif [[ -d "$target" ]]; then
    if [[ -f "$target/report.json" ]]; then
      report_file="$target/report.json"
    elif [[ -f "$target/findings.json" ]]; then
      report_file="$target/findings.json"
    else
      die "query: no report.json or findings.json in $target"
    fi
  elif [[ -f "$target" ]]; then
    report_file="$target"
  else
    die "query: path not found: $target"
  fi

  ensure_jq

  local filter='
    def csv_list($s): if $s == "" then [] else ($s | split(",") | map(ascii_downcase | gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))) end;
    (if type == "array" then {scanners: [], findings: .} else {scanners: (.scanners // []), findings: (.findings // [])} end) as $doc
    | csv_list($sev) as $sevs
    | csv_list($tool) as $tools
    | csv_list($rule) as $rules
    | ($doc.findings | map(
        select(($sevs | length == 0) or ((.severity // "" | ascii_downcase) as $v | $sevs | index($v) != null))
        | select(($tools | length == 0) or ((.tool // "" | ascii_downcase) as $v | $tools | index($v) != null))
        | select(($rules | length == 0) or ((.rule // "" | ascii_downcase) as $v | $rules | index($v) != null))
        | select(($path == "") or ((.file // "") | contains($path)))
      )) as $matched
    | {scanners: $doc.scanners, findings: $matched}
  '

  case "$format" in
    json)
      jq --arg sev "$severity" --arg tool "$tool" --arg rule "$rule" --arg path "$path_substr" \
        "$filter" "$report_file"
      ;;
    text)
      jq -r --arg sev "$severity" --arg tool "$tool" --arg rule "$rule" --arg path "$path_substr" \
        "$filter |
          (if (.scanners | length) > 0 then
            \"Scanners: \" + (.scanners | map(.tool + \"=\" + .status) | join(\", \"))
          else empty end),
          \"Findings: \" + (.findings | length | tostring),
          (.findings[] | \"[\" + (.severity // \"note\") + \"] \" + (.tool // \"gimlet\") + \"/\" + (.rule // \"unknown\") + \" \" + (.file // \"\") + (if (.line // 0) > 0 then \":\" + (.line | tostring) else \"\" end) + \": \" + (.message // \"\"))" \
        "$report_file"
      ;;
    sarif)
      jq --arg sev "$severity" --arg tool "$tool" --arg rule "$rule" --arg path "$path_substr" \
        "$filter | {
          \"\$schema\": \"https://json.schemastore.org/sarif-2.1.0.json\",
          version: \"2.1.0\",
          runs: [{
            tool: {
              driver: {
                name: \"gimlet\",
                rules: ([.findings[] | {id: ((.tool // \"gimlet\") + \"/\" + (.rule // \"unknown\"))}] | unique_by(.id))
              }
            },
            results: [.findings[] | {
              ruleId: ((.tool // \"gimlet\") + \"/\" + (.rule // \"unknown\")),
              level: (if (.severity // \"\") == \"error\" then \"error\" elif (.severity // \"\") == \"warning\" then \"warning\" else \"note\" end),
              message: {text: (.message // \"\")},
              locations: [{
                physicalLocation: {
                  artifactLocation: {uri: (.file // \"\")},
                  region: {startLine: (if (.line // 0) > 0 then .line else 1 end)}
                }
              }]
            }]
          }]
        }" "$report_file"
      ;;
  esac
}
