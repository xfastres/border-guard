export function bootstrap(root = document.querySelector('#app')) {
  if (!root) {
    throw new Error('Border Guard bootstrap failed: #app root was not found.');
  }

  const shell = document.createElement('main');
  shell.className = 'modular-shell';
  shell.innerHTML = `
    <section class="modular-shell__card" aria-labelledby="shell-title">
      <p class="modular-shell__eyebrow">BORDER GUARD · PHASE 1</p>
      <h1 id="shell-title">模块化工程骨架已就绪</h1>
      <p class="modular-shell__lead">
        这是构建链路验证页，不是可玩的游戏版本。
      </p>
      <div class="modular-shell__status">
        <span class="modular-shell__status-dot" aria-hidden="true"></span>
        <span>ES Modules 启动成功</span>
      </div>
      <p class="modular-shell__note">
        原版 v0.60 仍保留在仓库根目录。游戏系统将在后续阶段逐个迁移，
        完成行为等价验收前不会替换原版入口。
      </p>
    </section>
  `;

  root.replaceChildren(shell);
  root.dataset.booted = 'true';
  return root;
}
