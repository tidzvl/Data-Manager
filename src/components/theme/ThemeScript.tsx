// Chạy trước khi paint để tránh nháy sáng/tối (FOUC).
export default function ThemeScript() {
  const code = `(function(){try{
    var t=localStorage.getItem('dm-theme')||'dark';
    var d=t==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;
    var r=document.documentElement;
    r.dataset.theme=d;
    r.style.colorScheme=d;
    var m=document.querySelector('meta[name="theme-color"]');
    if(m)m.setAttribute('content',d==='light'?'#fdf6ea':'#0a0a0b');
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
