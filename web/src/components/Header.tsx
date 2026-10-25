import { Link } from 'react-router';
import { useMeta } from '../api/queries';

export function Header() {
  const meta = useMeta();
  return (
    <header className="site-header">
      <Link className="brand" to="/">
        角色人生
      </Link>
      <span className="site-subtitle">一个人的生活，一段一段地发生</span>
      <span className="header-spacer" />
      {meta.data?.provider === 'fixture' && (
        <span className="badge" title="使用确定性假模型，内容不是 AI 生成">
          Fixture 模式
        </span>
      )}
      {meta.data?.provider === 'openrouter' && (
        <span className="header-meta" title={`模型：${meta.data.model}`}>
          {meta.data.modelConfigured ? `已用 $${meta.data.budget.spentUsd.toFixed(3)} / $${meta.data.budget.capUsd}` : '未配置模型密钥'}
        </span>
      )}
    </header>
  );
}
