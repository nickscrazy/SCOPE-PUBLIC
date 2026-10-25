import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import type { Profile } from "./domain";
import { emptyProfile, profileSchema } from "./domain";
import { api } from "./api";
import { Eyebrow, ErrorMessage, Loading, Success } from "./components";
export function ProfileEditor() {
  const [p, setP] = useState<Profile>(emptyProfile),
    [loaded, setLoaded] = useState(false),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const welcome = params.get("welcome") === "1";
  useEffect(() => {
    api<{ profile: Profile | null }>("/profile")
      .then((r) => {
        if (r.profile) setP(r.profile);
        setLoaded(true);
      })
      .catch((e) => setError((e as Error).message));
  }, []);
  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setP((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    const valid = profileSchema.safeParse(p);
    if (!valid.success) {
      setError(valid.error.issues.map((i) => i.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      await api("/profile", {
        method: "PUT",
        body: JSON.stringify(valid.data),
      });
      setSaved(true);
      navigate("/app");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const number = (value: string) => (value === "" ? null : Number(value));
  if (!loaded && !error) return <Loading />;
  return (
    <>
      <div className="app-heading">
        <div>
          <Eyebrow>YOUR BUSINESS, IN CONTEXT</Eyebrow>
          <h1>
            The better we know you,
            <br />
            the clearer the view.
          </h1>
          <p>Tell us what you know. Leave uncertain information blank.</p>
        </div>
      </div>
      {welcome && (
        <Success message="Your account is ready. Check your inbox for a link to confirm your email address. Meanwhile, describe your business so we can rank opportunities for you." />
      )}
      <div className="profile-layout">
        <aside className="profile-progress">
          {[
            "Business & services",
            "Experience & credentials",
            "People & capacity",
            "Commercial preferences",
          ].map((s, i) => (
            <button
              key={s}
              type="button"
              className={step === i ? "active" : ""}
              aria-current={step === i ? "step" : undefined}
              onClick={() => setStep(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s}
            </button>
          ))}
          <p>
            Your declared details guide relevance. They are not independently
            verified.
          </p>
        </aside>
        <form className="profile-form" onSubmit={submit}>
          <span className="micro">STEP {step + 1} OF 4</span>
          <h2>
            {
              [
                "Start with your strengths.",
                "What have you built on?",
                "Room to take on more.",
                "The right kind of opportunity.",
              ][step]
            }
          </h2>
          <ErrorMessage message={error} />
          {saved && <Success message="Profile saved." />}
          {step === 0 && (
            <>
              <label>
                Business name
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={p.companyName}
                  onChange={(e) => update("companyName", e.target.value)}
                  placeholder="Your registered or trading name"
                />
              </label>
              <label>
                Services
                <span className="label-hint">
                  Separate each service with a comma
                </span>
                <CommaInput
                  value={p.services}
                  onChange={(v) => update("services", v)}
                  required
                  placeholder="Research, policy analysis, web development"
                />
              </label>
              <label>
                Sectors
                <span className="label-hint">
                  Separate each sector with a comma
                </span>
                <CommaInput
                  value={p.sectors}
                  onChange={(v) => update("sectors", v)}
                  placeholder="Research, digital, hospitality"
                />
              </label>
              <label>
                Business experience
                <textarea
                  rows={4}
                  maxLength={3000}
                  value={p.experience}
                  onChange={(e) => update("experience", e.target.value)}
                  placeholder="What do you specialise in? What experience would you bring?"
                />
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <label>
                Relevant past projects
                <textarea
                  rows={4}
                  maxLength={3000}
                  value={p.projects}
                  onChange={(e) => update("projects", e.target.value)}
                  placeholder="Briefly describe relevant work. Omit confidential client details."
                />
              </label>
              <div className="section-row">
                <h3>Qualifications & certificates</h3>
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    update("qualifications", [
                      ...p.qualifications,
                      { name: "", acquiredAt: null, expiresAt: null },
                    ])
                  }
                  disabled={p.qualifications.length >= 20}
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
              {!p.qualifications.length && (
                <p className="muted small-text">
                  No credentials recorded. Missing credentials will be marked
                  unknown.
                </p>
              )}
              {p.qualifications.map((q, i) => (
                <div className="credential-row" key={i}>
                  <label>
                    Name
                    <input
                      value={q.name}
                      required
                      maxLength={120}
                      onChange={(e) =>
                        update(
                          "qualifications",
                          p.qualifications.map((c, j) =>
                            j === i ? { ...c, name: e.target.value } : c,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Acquired (optional)
                    <input
                      type="date"
                      value={q.acquiredAt || ""}
                      onChange={(e) =>
                        update(
                          "qualifications",
                          p.qualifications.map((c, j) =>
                            j === i
                              ? { ...c, acquiredAt: e.target.value || null }
                              : c,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Expires (optional)
                    <input
                      type="date"
                      value={q.expiresAt || ""}
                      onChange={(e) =>
                        update(
                          "qualifications",
                          p.qualifications.map((c, j) =>
                            j === i
                              ? { ...c, expiresAt: e.target.value || null }
                              : c,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={"Remove qualification " + (i + 1)}
                    onClick={() =>
                      update(
                        "qualifications",
                        p.qualifications.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </>
          )}
          {step === 2 && (
            <>
              <div className="form-grid">
                <label>
                  Permanent staff
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={p.staff ?? ""}
                    onChange={(e) => update("staff", number(e.target.value))}
                    placeholder="Unknown"
                  />
                </label>
                <label>
                  Contractors
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={p.contractors ?? ""}
                    onChange={(e) =>
                      update("contractors", number(e.target.value))
                    }
                    placeholder="Unknown"
                  />
                </label>
              </div>
              <label>
                Available capacity (full-time equivalents)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  max="10000"
                  value={p.capacity ?? ""}
                  onChange={(e) => update("capacity", number(e.target.value))}
                  placeholder="Unknown"
                />
              </label>
              <label>
                Annual turnover band
                <select
                  value={p.turnover}
                  onChange={(e) =>
                    update("turnover", e.target.value as Profile["turnover"])
                  }
                >
                  <option value="unknown">Prefer to leave unknown</option>
                  <option value="under50k">Under €50,000</option>
                  <option value="50k-250k">€50,000–€250,000</option>
                  <option value="250k-1m">€250,000–€1 million</option>
                  <option value="1m-5m">€1–5 million</option>
                  <option value="over5m">Over €5 million</option>
                </select>
              </label>
              <p className="notice">
                Only financial bands are needed. Do not share accounts, tax
                records or bank details.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <fieldset>
                <legend>Preferred geography</legend>
                <div className="row">
                  {(["Malta", "EU"] as const).map((g) => (
                    <label key={g} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={p.geographies.includes(g)}
                        onChange={(e) =>
                          update(
                            "geographies",
                            e.target.checked
                              ? [...p.geographies, g]
                              : p.geographies.filter((v) => v !== g),
                          )
                        }
                      />
                      {g === "EU" ? "European Union" : g}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="form-grid">
                <label>
                  Minimum project value (€)
                  <input
                    type="number"
                    min="0"
                    max="10000000000"
                    value={p.minValue}
                    onChange={(e) => update("minValue", Number(e.target.value))}
                    required
                  />
                </label>
                <label>
                  Maximum project value (€)
                  <input
                    type="number"
                    min={p.minValue}
                    max="10000000000"
                    value={p.maxValue}
                    onChange={(e) => update("maxValue", Number(e.target.value))}
                    required
                  />
                </label>
              </div>
              <label>
                Intended role
                <select
                  value={p.role}
                  onChange={(e) =>
                    update("role", e.target.value as Profile["role"])
                  }
                >
                  <option value="bidder">Lead bidder</option>
                  <option value="subcontractor">Subcontractor</option>
                  <option value="consortium">Consortium member</option>
                </select>
              </label>
              <label>
                Interested in
                <select
                  value={p.interests}
                  onChange={(e) =>
                    update("interests", e.target.value as Profile["interests"])
                  }
                >
                  <option value="both">Tenders and business funding</option>
                  <option value="tenders">Public tenders</option>
                  <option value="grants">Grants and tax credits</option>
                </select>
              </label>
            </>
          )}
          <div className="profile-form-actions">
            <button
              type="button"
              className="button plain"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button className="button forest" disabled={busy}>
              {busy
                ? "Saving…"
                : step === 3
                  ? "Save & see my matches"
                  : "Continue"}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
function CommaInput({
  value,
  onChange,
  ...props
}: {
  value: string[];
  onChange: (v: string[]) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => {
    setText(value.join(", "));
  }, []);
  return (
    <input
      {...props}
      value={text}
      maxLength={2000}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
