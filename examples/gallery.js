const cases=[...document.querySelectorAll('.case')];
const groups=[...document.querySelectorAll('.case-group')];
const narrowNavigation=matchMedia('(max-width:760px)');
const revealSelection=()=>{
 const card=document.querySelector('.case[aria-current="true"]');
 if(card?.closest('.case-group').classList.contains('is-open'))card.scrollIntoView({block:'nearest',inline:'nearest'});
};
const setGroupOpen=(group,open)=>{
 group.classList.toggle('is-open',open);
 group.querySelector('.case-group-toggle').setAttribute('aria-expanded',String(open));
 group.querySelector('.case-items').hidden=!open;
};
for(const group of groups)group.querySelector('.case-group-toggle').addEventListener('click',()=>{
 const open=!group.classList.contains('is-open');
 for(const other of groups)setGroupOpen(other,other===group&&open);
 revealSelection();
});
revealSelection();
narrowNavigation.addEventListener('change',revealSelection);
for(const card of cases)card.addEventListener('click',event=>{
 if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 for(const other of cases)other.removeAttribute('aria-current');
 card.setAttribute('aria-current','true');
 revealSelection();
 document.getElementById('preview-title').textContent=card.dataset.title;
 document.getElementById('preview-summary').textContent=card.dataset.summary;
 document.querySelector('iframe').title=card.dataset.title+'交互地图';
 document.getElementById('open-map').href=card.getAttribute('href');
});
