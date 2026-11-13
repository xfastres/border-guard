() => {
  const field=document.querySelector('.field').getBoundingClientRect();
  const board=$('board'),dock=$('mobileDock'),side=document.querySelector('.side');
  const checks=[
    {name:'竖屏视口已启用',pass:MOBILE()&&innerWidth<=720},
    {name:'地图容器不撑出屏幕',pass:field.right<=innerWidth&&field.width<=innerWidth},
    {name:'大地图在容器内部可横向滚动',pass:board.clientWidth<canvas.offsetWidth&&board.scrollWidth>board.clientWidth},
    {name:'底部操作栏使用屏幕宽度',pass:!!dock&&dock.getBoundingClientRect().width>=innerWidth-20},
    {name:'长营地面板可以滚动',pass:side.scrollHeight>side.clientHeight&&getComputedStyle(side).overflowY==='auto'},
    {name:'查看地点时优先显示当前决策',pass:game.panel&&getComputedStyle(document.querySelector('.objective')).display==='none'}
  ];
  return {passed:checks.filter(c=>c.pass).length,total:checks.length,checks};
}
