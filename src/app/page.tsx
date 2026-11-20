import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Gauge,
  LayoutDashboard,
  QrCode,
  Truck,
  Wrench,
} from "lucide-react";
import { Brand } from "@/components/common";
import { DemoButtons } from "@/components/demo-buttons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const queue = [
  {
    name: "Generator G-01",
    task: "Oil & filter change",
    due: "Every 100 h · due at 150 h",
    status: "due_soon",
    label: "Due soon",
  },
  {
    name: "Fresh-water pump",
    task: "Inspection",
    due: "Every 30 days · due today",
    status: "due_now",
    label: "Due now",
  },
  {
    name: "Hood & grease filters",
    task: "Deep clean",
    due: "Every 14 days · 3 days late",
    status: "overdue",
    label: "Overdue",
  },
  {
    name: "Upright refrigerator",
    task: "Coil cleaning",
    due: "Every 90 days · in 41 days",
    status: "current",
    label: "Current",
  },
] as const;

export default function Home() {
  return (
    <>
      <header className="public-header">
        <div className="public-container">
          <Brand />
          <nav aria-label="Public navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#about">About the project</a>
            <Button variant="outline" asChild>
              <Link href="/login/">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main">
        <section className="landing-hero">
          <div className="public-container hero-grid">
            <div className="hero-copy">
              <h1>Keep your kitchen moving.</h1>
              <p>
                Equipment maintenance for food trucks and mobile kitchens.
                Schedules run on engine hours or days, and your crew logs the
                work from a QR label on each unit.
              </p>
              <DemoButtons />
              <p className="demo-note">
                Shared demo with fictional data. No account needed.
              </p>
            </div>
            <div className="app-frame" aria-hidden="true">
              <div className="app-frame-bar">
                <span />
                <span />
                <span />
                <em>vanlog · Maintenance</em>
              </div>
              <div className="app-frame-body">
                <div className="frame-rail">
                  <span>
                    <LayoutDashboard />
                    Dashboard
                  </span>
                  <span>
                    <Truck />
                    Equipment
                  </span>
                  <span className="selected">
                    <Wrench />
                    Maintenance
                  </span>
                  <span>
                    <Clock3 />
                    History
                  </span>
                  <span>
                    <FileText />
                    Cost reports
                  </span>
                </div>
                <div className="frame-main">
                  <div className="frame-head">
                    <strong>Maintenance queue</strong>
                    <span>4 tasks · sorted by urgency</span>
                  </div>
                  <div className="frame-stats">
                    <div>
                      <b className="t-overdue">1</b>
                      <span>Overdue</span>
                    </div>
                    <div>
                      <b className="t-due_now">1</b>
                      <span>Due now</span>
                    </div>
                    <div>
                      <b className="t-due_soon">1</b>
                      <span>Due soon</span>
                    </div>
                    <div>
                      <b>145.0 h</b>
                      <span>Generator runtime</span>
                    </div>
                  </div>
                  <ul className="frame-rows">
                    {queue.map((item) => (
                      <li key={item.name}>
                        <div>
                          <strong>{item.name}</strong>
                          <span>
                            {item.task} · {item.due}
                          </span>
                        </div>
                        <Badge variant={item.status}>{item.label}</Badge>
                        <ChevronRight />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="workflow-section">
          <div className="public-container">
            <div className="section-head">
              <h2>From a quick scan to a clear record.</h2>
              <p>
                Three steps your crew already does between stops, now on one
                record per unit.
              </p>
            </div>
            <div className="workflow-steps">
              <article>
                <div className="step-visual">
                  <div className="mini-label">
                    <QrCode />
                    <div>
                      <strong>Generator G-01</strong>
                      <span>Scan to log work</span>
                    </div>
                  </div>
                </div>
                <span className="step-number">01</span>
                <h3>Open the equipment</h3>
                <p>
                  Print a QR label for each unit. A scan opens its record on
                  any phone.
                </p>
              </article>
              <article>
                <div className="step-visual">
                  <div className="mini-reading">
                    <span>New cumulative hours</span>
                    <div>
                      <Gauge />
                      <strong>152.5 h</strong>
                      <em>+7.5 h</em>
                    </div>
                    <i>Save reading</i>
                  </div>
                </div>
                <span className="step-number">02</span>
                <h3>Log the work</h3>
                <p>
                  Add a meter reading or confirm a service in a few taps, with
                  a note if something looked off.
                </p>
              </article>
              <article>
                <div className="step-visual">
                  <ul className="mini-due">
                    <li>
                      <CheckCircle2 />
                      Oil & filter change
                      <Badge variant="current">Done</Badge>
                    </li>
                    <li>
                      <Clock3 />
                      Pump inspection
                      <Badge variant="due_now">Due now</Badge>
                    </li>
                  </ul>
                </div>
                <span className="step-number">03</span>
                <h3>Know what is due</h3>
                <p>
                  See schedules, service history and repair costs for the whole
                  fleet in one place.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="about" className="studio-band">
          <div className="public-container studio-grid">
            <h2>Built for the work between stops.</h2>
            <div>
              <p>
                VanLog is a self-initiated ConsoleLog Studio project exploring a
                simpler maintenance workflow for mobile kitchens.
              </p>
              <div className="studio-links">
                <a
                  href="https://consolelog.studio/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Meet ConsoleLog Studio
                  <ExternalLink />
                </a>
                <Link href="/login/">
                  Sign in with your team account
                  <ArrowRight />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="public-footer public-container">
        <Brand />
        <div>
          <span>Portfolio concept</span>
          <a
            href="https://github.com/shawalkabirchy/vanlog"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
            <ExternalLink />
          </a>
        </div>
      </footer>
    </>
  );
}
