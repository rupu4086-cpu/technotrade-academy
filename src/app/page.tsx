// src/app/page.tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const faqs = [
  ["Is this suitable for beginners?", "Yes. Start with market foundations, then progress to risk management and strategy testing. No trading experience is required."],
  ["Do I need a funded trading account?", "No. Practice with paper trading first. A broker account or real-money deposit is not required to study."],
  ["Will you provide trading signals?", "No. These courses teach research, execution principles, and risk management—not buy or sell recommendations."],
  ["Are returns guaranteed?", "No. Trading can result in substantial losses. Education cannot guarantee profitable results."],
  ["How do I access a purchased course?", "Sign in with your email and complete checkout. Access is granted only after the payment is verified as captured."],
];

export default function Home() {
  const [prepared, setPrepared] = useState(false);

  function enquire(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = encodeURIComponent(`Course enquiry: ${data.get("interest")}`);
    const body = encodeURIComponent(
      `Name: ${data.get("name")}\nEmail: ${data.get("email")}\n\n${data.get("message")}`,
    );
    window.location.href = `mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@technotrade.academy"}?subject=${subject}&body=${body}`;
    setPrepared(true);
  }

  return (
    <main>
      <header className="nav wrap">
        <Link href="/" className="brand" aria-label="TechnoTrade Academy home">
          <span className="mark">↗</span> TechnoTrade<span className="muted"> Academy</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/courses">Courses</Link>
          <a href="#path">Our approach</a>
          <a href="#contact" className="nav-contact">Get in touch ↗</a>
        </nav>
      </header>

      <section className="hero wrap">
        <div>
          <p className="eyebrow"><span className="dot" /> EDUCATION FIRST. ALWAYS.</p>
          <h1>Understand the market.<br /><em>Own your process.</em></h1>
          <p className="intro">Build a thoughtful approach to trading. Learn market mechanics, manage risk, and develop a repeatable process—without the hype.</p>
          <div className="actions">
            <Link href="/courses" className="button">Explore courses <span>↗</span></Link>
            <a href="#path" className="text-link">See the learning path →</a>
          </div>
          <p className="micro">Beginner-friendly · Self-paced learning · English instruction</p>
        </div>

        <div className="terminal" aria-label="Illustrative market analysis diagram, not live market data">
          <div className="terminal-top"><span>THE PROCESS / 01</span><span className="live">LEARN → PRACTICE</span></div>
          <div className="terminal-title">Look beyond the price.</div>
          <p className="muted">Context. Structure. Discipline.</p>
          <svg viewBox="0 0 480 230" role="img" aria-label="An abstract price chart with an upward trend">
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#bef264" stopOpacity=".22" />
                <stop offset="100%" stopColor="#bef264" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[40, 90, 140, 190].map(y => <line key={y} x1="0" x2="480" y1={y} y2={y} stroke="#293432" />)}
            <path d="M0 190 L40 170 L75 182 L115 125 L150 143 L190 97 L225 115 L265 70 L300 97 L345 45 L380 62 L425 22 L480 38 L480 230 L0 230Z" fill="url(#chartFill)" />
            <path d="M0 190 L40 170 L75 182 L115 125 L150 143 L190 97 L225 115 L265 70 L300 97 L345 45 L380 62 L425 22 L480 38" fill="none" stroke="#bef264" strokeWidth="3" />
          </svg>
          <div className="terminal-bottom"><span>PLAN BEFORE YOU TRADE</span><span>Illustration only</span></div>
        </div>
      </section>

      <section className="market-strip" aria-label="Markets covered, not live quotes">
        <div className="wrap market-inner">
          <span className="eyebrow">YOUR MARKET. YOUR STARTING POINT.</span>
          <span>STOCKS <b>↗</b></span><span>CRYPTO <b>↗</b></span><span>FOREX <b>↗</b></span>
          <span className="micro">Principles over predictions.</span>
        </div>
      </section>

      <section className="stats wrap" aria-label="Academy at a glance">
        <div><strong>3</strong><span>Core markets to explore</span></div>
        <div><strong>5</strong><span>Focused learning tracks</span></div>
        <div><strong>100%</strong><span>Education, not signals</span></div>
        <div><strong>Your pace</strong><span>A process built around you</span></div>
      </section>

      <section className="section wrap">
        <div className="section-heading">
          <div><p className="eyebrow">FIND YOUR FOCUS</p><h2>Different markets.<br />The same disciplined mindset.</h2></div>
          <Link href="/courses" className="text-link">View all courses ↗</Link>
        </div>
        <div className="grid-three">
          {[
            ["01", "Stock", "Understand the businesses behind the ticker.", "Market structure, fundamental research, and technical foundations."],
            ["02", "Crypto", "Navigate a market that never sleeps.", "Digital assets, custody, liquidity, and the risks of volatile markets."],
            ["03", "Forex", "See the bigger economic picture.", "Currency pairs, macroeconomic drivers, position sizing, and leverage."],
          ].map(([n, category, title, description]) => (
            <Link className="category" href={`/courses?category=${category}`} key={category}>
              <div className="card-top"><span>{n} / {category.toUpperCase()}</span><span>↗</span></div>
              <h3>{title}</h3><p>{description}</p><span className="card-link">Explore {category.toLowerCase()} courses →</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="path" className="path section">
        <div className="wrap">
          <p className="eyebrow">A CLEAR WAY FORWARD</p><h2>Build skill. Not shortcuts.</h2>
          <div className="steps">
            {[
              ["01", "Learn the foundations", "Understand order types, market participants, and how prices move."],
              ["02", "Put risk first", "Plan position size, define invalidation, and understand potential losses."],
              ["03", "Practice with purpose", "Test ideas in a simulated environment and keep a trading journal."],
              ["04", "Review and refine", "Evaluate decisions, recognise biases, and improve your process."],
            ].map(([n, title, copy]) => <article key={n}><span className="step-number">{n}</span><h3>{title}</h3><p>{copy}</p></article>)}
          </div>
        </div>
      </section>

      <section className="section wrap faq">
        <div><p className="eyebrow">BEFORE YOU BEGIN</p><h2>A little clarity<br />goes a long way.</h2></div>
        <div>{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
      </section>

      <section id="contact" className="section wrap contact">
        <div><p className="eyebrow">LET’S FIND YOUR STARTING POINT</p><h2>Questions?<br /><em>We’re listening.</em></h2><p className="muted">Tell us what you want to learn. Please do not include account credentials or financial information.</p></div>
        <form onSubmit={enquire}>
          <div className="form-row">
            <label>Your name<input name="name" autoComplete="name" required maxLength={100} placeholder="Alex Morgan" /></label>
            <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="alex@example.com" /></label>
          </div>
          <label>I’m interested in<select name="interest"><option>Choosing my first course</option><option>Stock markets</option><option>Crypto markets</option><option>Forex markets</option><option>Trading psychology</option><option>Advanced learning</option></select></label>
          <label>Your question<textarea name="message" rows={4} required minLength={10} maxLength={3000} placeholder="How can we help?" /></label>
          <p className="micro">This opens your email app. Your enquiry is not sent until you send the email.</p>
          <button className="button" type="submit">Prepare enquiry ↗</button>
          {prepared && <p role="status" className="micro">Your email draft is ready. If no app opened, email {process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@technotrade.academy"}.</p>}
        </form>
      </section>

      <footer>
        <div className="wrap">
          <div className="footer-top"><Link href="/" className="brand">↗ TechnoTrade Academy</Link><Link href="/courses">Explore courses →</Link></div>
          <p><strong>Risk disclaimer:</strong> All content is for educational purposes only and is not investment, financial, legal, or tax advice. Trading stocks, cryptocurrencies, and forex involves substantial risk, including the loss of your entire capital. Leveraged products can result in losses exceeding your initial deposit. Past performance does not predict future results. Consider your circumstances and consult an appropriately qualified adviser before making financial decisions.</p>
          <div className="footer-bottom"><span>© {new Date().getFullYear()} TechnoTrade Academy</span><span>Learn thoughtfully. Trade responsibly.</span></div>
        </div>
      </footer>

      <style jsx global>{`
        *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:24px}body{margin:0;background:#0d1412;color:#f2f5ee;font-family:Arial,Helvetica,sans-serif}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}button,a,input,select,textarea,summary{-webkit-tap-highlight-color:transparent}a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid #bef264;outline-offset:6px}button{cursor:pointer}::selection{background:#bef264;color:#0d1412}.wrap{max-width:1200px;margin:auto;padding-left:32px;padding-right:32px}.muted{color:#a3b0a7}.nav{display:flex;align-items:center;justify-content:space-between;min-height:100px;gap:24px}.brand{font-size:18px;font-weight:700;letter-spacing:-.5px}.mark{display:inline-grid;place-items:center;background:#bef264;color:#142016;width:30px;height:30px;margin-right:8px;border-radius:7px}.nav nav{display:flex;align-items:center;gap:30px;font-size:14px}.nav-contact{border:1px solid #364139;padding:12px 16px;border-radius:6px}.hero{display:grid;grid-template-columns:1.2fr 1fr;gap:60px;align-items:center;padding-top:74px;padding-bottom:90px}.eyebrow{font-size:11px;letter-spacing:1.7px;font-weight:700;color:#b6c3b9;line-height:1.8}.dot{display:inline-block;background:#bef264;width:7px;height:7px;border-radius:50%;margin-right:8px}h1{font-size:clamp(40px,4.5vw,62px);line-height:1.08;letter-spacing:-2.8px;font-weight:500;margin:25px 0}em{font-style:normal;color:#bef264}.intro{color:#a3b0a7;line-height:1.8;max-width:460px;font-size:16px}.actions{display:flex;align-items:center;gap:24px;margin:30px 0 22px}.button{display:inline-flex;align-items:center;justify-content:space-between;gap:28px;background:#bef264;border:0;border-radius:6px;color:#172112;padding:16px 21px;font-weight:700;font-size:14px}.button:hover{background:#d1ff85}.text-link{font-size:14px;font-weight:600}.micro{font-size:11px;color:#a3b0a7;line-height:1.7}.terminal{background:linear-gradient(140deg,#1a2520,#101916);border:1px solid #364139;border-radius:12px;padding:24px;transform:rotate(-2deg);box-shadow:0 20px 70px #0004}.terminal-top,.terminal-bottom{display:flex;justify-content:space-between;gap:12px;font-size:9px;letter-spacing:1px;color:#9baa9e}.live{color:#bef264}.terminal-title{font-size:25px;letter-spacing:-.7px;margin-top:40px}.terminal p{font-size:13px}.terminal svg{width:100%;height:auto;margin:22px 0}.terminal-bottom{border-top:1px solid #364139;padding-top:18px;font-size:8px}.market-strip{border-top:1px solid #2a352e;border-bottom:1px solid #2a352e;background:#131c17}.market-inner{display:flex;justify-content:space-between;gap:25px;align-items:center;padding-top:22px;padding-bottom:22px;font-size:13px;font-weight:600}.market-inner b{color:#bef264;margin-left:12px}.market-inner .eyebrow{font-size:9px}.stats{display:grid;grid-template-columns:repeat(4,1fr);padding-top:42px;padding-bottom:42px;border-bottom:1px solid #2a352e}.stats div{display:flex;flex-direction:column;gap:10px;padding-left:28px;border-left:1px solid #2a352e}.stats div:first-child{border:0;padding-left:0}.stats strong{font-size:30px;font-weight:500;letter-spacing:-1px}.stats span{font-size:12px;color:#a3b0a7}.section{padding-top:88px;padding-bottom:88px}h2{font-size:clamp(30px,3.2vw,42px);font-weight:500;letter-spacing:-1.5px;line-height:1.18;margin:17px 0 30px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:30px}.grid-three{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:20px}.category{padding:28px;border:1px solid #354037;border-radius:9px;background:#141e18;transition:transform .2s,border-color .2s}.category:hover{transform:translateY(-4px);border-color:#bef264}.card-top{display:flex;justify-content:space-between;color:#bef264;font-size:11px;letter-spacing:1px}.category h3{font-size:23px;font-weight:500;letter-spacing:-.6px;line-height:1.3;margin-top:44px}.category p,.steps p{font-size:14px;line-height:1.75;color:#a3b0a7}.card-link{display:block;margin-top:30px;font-size:12px}.path{background:#17211b;border-block:1px solid #2a352e}.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:32px;margin-top:45px}.step-number{display:block;color:#bef264;border-top:1px solid #465041;padding-top:20px;font-size:13px}.steps h3{font-size:17px;font-weight:500;margin-top:25px}.faq{display:grid;grid-template-columns:1fr 1.4fr;gap:70px}details{border-bottom:1px solid #354037;padding:22px 0}summary{cursor:pointer;font-size:15px;line-height:1.5}details p{font-size:14px;line-height:1.8;color:#a3b0a7}.contact{display:grid;grid-template-columns:1fr 1.2fr;gap:100px;border-top:1px solid #354037}.contact>div>p:last-child{font-size:14px;line-height:1.8;max-width:340px}label{display:flex;flex-direction:column;gap:10px;font-size:12px;margin-bottom:20px}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}input,select,textarea{width:100%;background:#17211b;color:#f2f5ee;border:1px solid #3b493e;border-radius:5px;padding:13px;outline:none}input:focus,select:focus,textarea:focus{border-color:#bef264;box-shadow:0 0 0 1px #bef264}textarea{resize:vertical}footer{border-top:1px solid #354037;background:#0a100d;padding:40px 0}.footer-top,.footer-bottom{display:flex;justify-content:space-between;gap:24px}.footer-top{align-items:center;font-size:13px}footer p{font-size:11px;line-height:1.9;color:#95a297;margin:30px 0}.footer-bottom{font-size:10px;color:#95a297;border-top:1px solid #263127;padding-top:20px}@media(max-width:900px){.hero{gap:30px}.nav .muted{display:none}.steps{grid-template-columns:repeat(2,1fr)}.contact{gap:40px}.market-inner>.micro{display:none}.actions{align-items:flex-start;flex-direction:column}.faq{gap:35px}}@media(max-width:640px){.wrap{padding-left:22px;padding-right:22px}.nav{min-height:80px}.nav nav{gap:16px}.nav nav a:not(:first-child){display:none}.brand{font-size:16px}.hero{grid-template-columns:1fr;padding-top:35px;padding-bottom:50px;gap:35px}h1{letter-spacing:-1.7px}.actions{flex-direction:row;align-items:center;gap:15px}.text-link{font-size:12px}.terminal{transform:none}.market-inner{flex-wrap:wrap;justify-content:space-between;gap:18px}.market-inner>.eyebrow{width:100%}.stats{grid-template-columns:1fr 1fr;gap:30px}.stats div:nth-child(3){padding-left:0;border:0}.stats strong{font-size:26px}.section{padding-top:55px;padding-bottom:55px}.section-heading{align-items:flex-start;flex-direction:column;gap:0}.grid-three,.faq,.contact{grid-template-columns:1fr}.steps{gap:22px}.category h3{margin-top:25px}.faq{gap:0}.contact{gap:20px}.form-row{grid-template-columns:1fr;gap:0}.footer-top,.footer-bottom{flex-direction:column}.footer-bottom{gap:12px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}
      `}</style>
    </main>
  );
}
