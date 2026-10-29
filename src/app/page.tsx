import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  ExternalLink,
  Truck,
  Wrench,
} from "lucide-react";
import { Brand } from "@/components/common";
import { DemoButtons } from "@/components/demo-buttons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
              <h1>
                Keep your
                <br />
                kitchen moving.
              </h1>
              <p>
                Track equipment hours, stay on top of maintenance, and give your
                team one simple place to log the work.
              </p>
              <DemoButtons />
              <p className="demo-note">
                A shared demo with fictional data. No account needed.
              </p>
            </div>
            <div
              className="product-preview"
              aria-label="Illustrative maintenance queue preview"
            >
              <div className="preview-top">
                <Brand />
                <span>Mobile kitchen</span>
              </div>
              <div className="preview-layout">
                <div className="preview-rail">
                  <span className="selected">
                    <Wrench />
                    Maintenance
                  </span>
                  <span>
                    <Truck />
                    Equipment
                  </span>
                  <span>
                    <Clock3 />
                    History
                  </span>
                </div>
                <div className="preview-main">
                  <h2>Maintenance queue</h2>
                  {[
                    {
                      name: "Generator G-01",
                      task: "Oil & filter change",
                      status: "due_soon",
                    },
                    {
                      name: "Fresh-water pump",
                      task: "Inspection",
                      status: "due_now",
                    },
                    {
                      name: "Upright refrigerator",
                      task: "Coil cleaning",
                      status: "current",
                    },
                  ].map((item) => (
                    <div className="preview-row" key={item.name}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.task}</span>
                      </div>
                      <Badge
                        variant={
                          item.status as "due_soon" | "due_now" | "current"
                        }
                      >
                        {item.status === "due_soon"
                          ? "Due soon"
                          : item.status === "due_now"
                            ? "Due now"
                            : "Current"}
                      </Badge>
                      <ChevronRight />
                    </div>
                  ))}
                  <div className="preview-meter">
                    <Clock3 />
                    <span>Current runtime</span>
                    <strong>145.0 h</strong>
                  </div>
                  <small>Illustrative sample · explore the live demo</small>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section
          id="how-it-works"
          className="workflow-section public-container"
        >
          <h2 className="sr-only">From a quick scan to a clear record.</h2>
          <div className="workflow-steps">
            {[
              {
                number: "01",
                title: "Open the equipment",
                copy: "QR labels take your team straight to the right record.",
              },
              {
                number: "02",
                title: "Log the work",
                copy: "Add a meter reading or confirm a service.",
              },
              {
                number: "03",
                title: "Know what is due",
                copy: "Review schedules, history, and repair costs.",
              },
            ].map((step) => (
              <article key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="about" className="studio-band">
          <div className="public-container studio-grid">
            <h2>
              Built for the work
              <br />
              between stops.
            </h2>
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
