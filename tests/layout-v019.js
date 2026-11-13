() => {
  const r=e=>e.getBoundingClientRect();
  const board=r($('board')),status=r(document.querySelector('.status'));
  const checks=[
    {name:'地图容器覆盖可用视口',pass:board.width>=innerWidth-2&&board.height>=innerHeight-2},
    {name:'页面没有外部溢出',pass:document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollHeight<=innerHeight+1},
    {name:'资源HUD位于视口内',pass:status.left>=0&&status.right<=innerWidth+1&&status.top>=0&&status.bottom<innerHeight},
    {name:'不再使用固定右侧列',pass:getComputedStyle(document.querySelector('.side')).position==='fixed'},
    {name:'移动端识别覆盖横屏',pass:!navigator.maxTouchPoints||MOBILE()},
    {name:'弹窗高度受视口约束',pass:parseFloat(getComputedStyle($('dialog')).maxHeight)<=innerHeight}
  ];
  return {total:checks.length,passed:checks.filter(c=>c.pass).length,checks,viewport:{w:innerWidth,h:innerHeight},board:{w:board.width,h:board.height}};
}
