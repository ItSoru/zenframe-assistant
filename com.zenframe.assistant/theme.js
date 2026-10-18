(function () {
 'use strict';
 var key='zenframeAssistant.accent', defaultColor='#b4a0f7';
 var picker=document.getElementById('accentColor'),hex=document.getElementById('accentHex'),status=document.getElementById('accentStatus');
 function valid(value){return /^#[0-9a-f]{6}$/i.test(value);}
 function rgb(color){return [1,3,5].map(function(i){return parseInt(color.slice(i,i+2),16);});}
 function mix(a,b,amount){var x=rgb(a),y=rgb(b);return '#'+x.map(function(v,i){return ('0'+Math.round(v+(y[i]-v)*amount).toString(16)).slice(-2);}).join('');}
 function luminance(color){var c=rgb(color).map(function(v){v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;}
 function contrast(a,b){var x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
 function apply(color,save){
  color=color.toLowerCase();if(!valid(color))return;
  var readable=color;for(var i=1;i<=100&&contrast(readable,'#28282f')<4.5;i++)readable=mix(color,'#ffffff',i/100);
  var onAccent=contrast(color,'#000000')>contrast(color,'#ffffff')?'#000000':'#ffffff';
  var hover=mix(color,onAccent==='#000000'?'#ffffff':'#000000',0.16);
  var style=document.documentElement.style;
  style.setProperty('--accent',readable);
  style.setProperty('--accent-rgb',rgb(readable).join(','));
  style.setProperty('--accent-fill',color);
  style.setProperty('--on-accent',onAccent);
  style.setProperty('--accent-hover',hover);
  style.setProperty('--accent-border',mix('#28282f',color,0.35));
  picker.value=color;hex.value=color;hex.removeAttribute('aria-invalid');
  Array.prototype.forEach.call(document.querySelectorAll('[data-accent]'),function(b){b.setAttribute('aria-pressed',String(b.dataset.accent===color));});
  var saved=true;if(save){try{localStorage.setItem(key,color);}catch(e){saved=false;}}
  status.textContent=!saved?'Applied for now. Your browser could not save this preference.':save?'Accent saved automatically.':'Changes apply immediately and save automatically.';
  if(readable!==color)status.textContent+=' Labels use a lighter shade for readability.';
 }
 picker.addEventListener('input',function(){apply(picker.value,true);});
 picker.addEventListener('change',function(){apply(picker.value,true);});
 hex.addEventListener('input',function(){var value=hex.value.trim();if(value.charAt(0)!=='#')value='#'+value;if(valid(value))apply(value,true);else{hex.setAttribute('aria-invalid','true');status.textContent='Use a six-digit hex color, such as #56C8E8.';}});
 Array.prototype.forEach.call(document.querySelectorAll('[data-accent]'),function(b){b.onclick=function(){apply(b.dataset.accent,true);};});
 document.getElementById('resetAccent').onclick=function(){apply(defaultColor,true);};
 var saved;try{saved=localStorage.getItem(key);}catch(e){}apply(valid(saved)?saved:defaultColor,false);
}());
