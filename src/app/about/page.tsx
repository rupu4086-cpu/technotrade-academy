// src/app/about/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | TechnoTrade Academy",
  description: "Practical trading education built around process and risk awareness.",
};

export default function AboutPage() {
  return (
    <main>
      <nav aria-label="Main navigation">
        <a href="/">TechnoTrade Academy</a>
        <span><a href="/contact">Contact</a><a href="/checkout">Course checkout</a></span>
      </nav>
      <header>
        <img src="/logo.svg" alt="TechnoTrade Academy — Learn Trade Grow" width="370" height="90" />
        <p className="eyebrow">ABOUT THE ACADEMY</p>
        <h1>Learn the process.<br />Respect the risk.</h1>
        <p>TechnoTrade Academy is being built for learners who want to understand markets—not chase promises of easy returns.</p>
      </header>

      <section>
        <h2>Our mission</h2>
        <p>Make trading concepts understandable while putting capital preservation, independent thinking, and disciplined decision-making first.</p>
      </section>

      <section>
        <h2>How we teach</h2>
        <div className="grid">
          <article><h3>Build foundations</h3><p>Understand market structure, order types, candlesticks, liquidity, and the costs of participating in markets.</p></article>
          <article><h3>Practise before risking money</h3><p>Work through chart examples and paper-trading exercises. Record assumptions and review outcomes without treating hindsight as a strategy.</p></article>
          <article><h3>Measure your process</h3><p>Use position sizing, predefined risk limits, and a trading journal. Discuss losing scenarios as carefully as winning ones.</p></article>
        </div>
      </section>

      <section>
        <h2>Instructor credibility, without inflated claims</h2>
        <p>Instructor names, relevant experience, teaching responsibilities, and any independently verifiable qualifications will be published before enrolment opens.</p>
        <p>We do not claim verified trading returns or regulatory registration without supporting evidence. Ask for instructor details and a sample lesson before deciding whether the course fits your needs.</p>
        <a href="/contact">Ask about the curriculum and instructors →</a>
      </section>

      <aside aria-labelledby="risk-heading">
        <h2 id="risk-heading">Risk disclosure</h2>
        <p>Content is for general education, not personalised investment advice, trade recommendations, or a promise of income. Trading can result in substantial losses; leveraged products may involve losses exceeding your initial deposit.</p>
        <p>Examples, simulations, and past performance do not predict future results. Use money you can afford to lose and consult an appropriately licensed adviser for advice about your circumstances.</p>
      </aside>
      <footer>© {new Date().getFullYear()} TechnoTrade Academy</footer>
      <style>{`
        *{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#17253b;font-family:Arial,sans-serif}
        main{max-width:1080px;margin:auto;padding:24px}nav{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
        nav span{display:flex;gap:20px}a{color:#096b56}header{padding:56px 0 28px;max-width:760px}
        img{max-width:100%;height:auto}.eyebrow{letter-spacing:3px;font-size:12px;font-weight:bold;margin-top:32px}
        h1{font-size:clamp(36px,6vw,60px);line-height:1.1;margin:16px 0}h2{font-size:25px}
        p{line-height:1.75}section{margin:32px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}
        article{background:white;padding:22px;border:1px solid #dae2ec;border-radius:16px}article h3{margin-top:0}
        aside{background:#e8eef5;padding:24px;border-left:4px solid #096b56;border-radius:8px}footer{padding:32px 0;color:#526174}
      `}</style>
    </main>
  );
}
