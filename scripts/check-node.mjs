const major = Number(process.versions.node.split('.')[0]);

if (major !== 24) {
  console.error(
    `当前 Node 版本是 ${process.versions.node}，本项目需要 Node 24（见 .nvmrc）。\n` +
      '可以运行：nvm install 24 && nvm use 24',
  );
  process.exit(1);
}
