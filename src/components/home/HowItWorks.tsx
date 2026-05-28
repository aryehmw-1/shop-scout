import { MapPin, Rows3, MousePointerClick } from "lucide-react";

const steps = [
  {
    icon: MapPin,
    title: "Set your ZIP",
    desc: "We surface stores near you for pickup and in-store pricing, plus online retailers that ship to your area.",
  },
  {
    icon: Rows3,
    title: "Two rows of results",
    desc: "Left: closest stores near you. Right: online deals that ship to you. Same search — groceries, clothes, gear, home.",
  },
  {
    icon: MousePointerClick,
    title: "Open the winner",
    desc: "Tap View deal — you land on that store with your product search ready. You always checkout on their site.",
  },
];

export function HowItWorks() {
  return (
    <section className="homy-linen border-y border-orange-100/80 bg-cream-50/60 px-6 py-16 backdrop-blur-sm lg:px-12">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-homy text-center text-3xl font-bold text-ink-900">
          How it works
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-ink-600">
          Simple as asking a neighbor who shops everywhere — built for your whole
          list.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="glass-card relative rounded-2xl p-6 transition hover:shadow-lg"
            >
              <span className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 via-amber-500 to-rose-500 text-sm font-bold text-white shadow-md">
                {i + 1}
              </span>
              <step.icon className="mt-2 text-sage-600" size={28} strokeWidth={2} />
              <h3 className="mt-4 text-lg font-semibold text-ink-800">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
