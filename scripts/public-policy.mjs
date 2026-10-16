/** 返回规则名称，不回显可能包含凭据的匹配文本。规则只是辅助，不能替代人工审核。 */
export function inspectPublicFile(path, content) {
  const findings = [];
  if (
    /^(work|outputs|data)\//.test(path) ||
    (/(?:^|\/)\.env(?:\..+)?$/.test(path) && !path.endsWith('.env.example')) ||
    /\.(?:apk|cer|pem|key|sqlite.*|db|log|jpe?g|png|webp|har)$/i.test(path)
  )
    findings.push('禁止公开的资料类型');
  const rules = [
    ['本机用户路径', /\/(?:Users|home)\/[a-zA-Z][\w.-]*\//],
    ['疑似手机号', /(?<![\w])1[3-9]\d{9}(?![\w])/],
    [
      '疑似真实业务标识',
      /(?:family[_-]?id|child[_-]?id|device[_-]?id|student[_-]?id)\s*["']?\s*[:=]\s*["']?\d{15,}/i,
    ],
    ['访问令牌', /Bearer\s+[a-zA-Z0-9._~-]{24,}/],
    ['JWT', /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/],
    ['私钥', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['平台凭据', /(?:gh[pousr]_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{30,})/],
    [
      '硬编码会话',
      /(?:tal_token|access_token|refresh_token)\s*["']?\s*[:=]\s*["'][a-zA-Z0-9._~-]{20,}/i,
    ],
    [
      '私人邀请链接',
      /https?:\/\/[^\s"']*[?&](?:invite_code|family_id)=[a-zA-Z0-9_-]+/,
    ],
  ];
  for (const [name, pattern] of rules)
    if (pattern.test(content)) findings.push(name);
  return findings;
}
