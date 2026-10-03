import { videoCreditsFor, type Pricing } from "./pricing";

/**
 * What the landing page shows, kept as data so page copy is not buried in JSX.
 *
 * Two kinds of footage, never mixed up:
 *
 *   - **Made with the Studio**: Tari's "Ondokea meter sharing" campaign
 *     (prepaid meters for landlords). The client's own campaign media,
 *     transcoded for the web into public/showcase/ and cut into short loops
 *     in public/showcase/clips/.
 *   - **Samples**: royalty-free stock clips from Pexels (public/showcase/
 *     samples/), downloaded with the owner's approval on 2 Oct 2026 to show
 *     the *kinds* of ad people make. They are labelled as stock on the page
 *     and must never be presented as output of the system.
 *
 * Generations a platform admin pins from the library are added at runtime
 * (GeneratedAsset.showcase, served by src/app/showcase/[id]).
 */

export interface ShowcaseMedia {
  kind: "image" | "video";
  src: string;
  poster?: string;
  title: string;
  caption: string;
  /** Seconds, for videos */
  duration?: number;
  aspect: "square" | "wide";
}

export const CLIENT_CASE = {
  client: "Tari",
  logo: "/showcase/tari-logo.png",
  product: "Tari prepaid meters",
  campaign: "Ondokea meter sharing",
  summary:
    "Tari sells prepaid electricity meters to landlords with shared-meter rentals. For the " +
    "“Ondokea meter sharing” campaign they made a launch poster and two video ads in the Studio, " +
    "telling the story from the landlord's paperwork to tenants topping up by M-Pesa.",
  media: [
    {
      kind: "video",
      src: "/showcase/tari-ad-24s.mp4",
      poster: "/showcase/tari-ad-24s.jpg",
      title: "Launch ad, 24 seconds",
      caption: "From a landlord buried in shared-bill paperwork to tenants topping up their own meters.",
      duration: 24,
      aspect: "wide",
    },
    {
      kind: "video",
      src: "/showcase/tari-spot-5s.mp4",
      poster: "/showcase/tari-spot-5s.jpg",
      title: "Social spot, 5 seconds",
      caption: "The campaign poster comes to life, then installation and a tenant buying units on her phone.",
      duration: 5,
      aspect: "wide",
    },
    {
      kind: "image",
      src: "/showcase/tari-poster.jpg",
      title: "Launch poster",
      caption: "The campaign key visual with the offer, benefits and contacts.",
      aspect: "square",
    },
  ] satisfies ShowcaseMedia[],
} as const;

/** The hero's background reel: Nairobi, then scenes from the Tari campaign. */
export const SHOWREEL = { src: "/showcase/showreel.mp4", poster: "/showcase/showreel.jpg" } as const;

export interface Clip {
  src: string;
  poster: string;
  title: string;
  /** What the card says under the title */
  tag: string;
  orientation: "portrait" | "landscape";
}

/** Scenes from the Tari campaign, made in the Studio. */
export const TARI_CLIPS: readonly Clip[] = [
  { src: "/showcase/clips/tari-topup.mp4", poster: "/showcase/clips/tari-topup.jpg", title: "Top up by M-Pesa", tag: "Vertical · Reels", orientation: "portrait" },
  { src: "/showcase/clips/tari-office.mp4", poster: "/showcase/clips/tari-office.jpg", title: "The landlord's problem", tag: "Story ad", orientation: "landscape" },
  { src: "/showcase/clips/tari-handover.mp4", poster: "/showcase/clips/tari-handover.jpg", title: "Meet the meter", tag: "Product reveal", orientation: "landscape" },
  { src: "/showcase/clips/tari-corridor.mp4", poster: "/showcase/clips/tari-corridor.jpg", title: "Happy tenants", tag: "Lifestyle", orientation: "landscape" },
  { src: "/showcase/clips/tari-paperwork.mp4", poster: "/showcase/clips/tari-paperwork.jpg", title: "No more paperwork", tag: "Before & after", orientation: "landscape" },
  { src: "/showcase/clips/tari-mascot.mp4", poster: "/showcase/clips/tari-mascot.jpg", title: "Brand end card", tag: "Mascot · Logo", orientation: "landscape" },
];

export interface SampleClip extends Clip {
  /** The Pexels page the clip came from */
  source: string;
}

/** Royalty-free stock from Pexels. Shown as formats, always labelled as stock. */
export const SAMPLE_CLIPS: readonly SampleClip[] = [
  { src: "/showcase/samples/perfume.mp4", poster: "/showcase/samples/perfume.jpg", title: "Luxury product reveal", tag: "Beauty", orientation: "portrait", source: "https://www.pexels.com/video/elegant-perfume-bottle-on-reflective-surface-38465228/" },
  { src: "/showcase/samples/burger.mp4", poster: "/showcase/samples/burger.jpg", title: "Food that sells itself", tag: "Restaurants", orientation: "portrait", source: "https://www.pexels.com/video/cheese-burger-19106944/" },
  { src: "/showcase/samples/fashion.mp4", poster: "/showcase/samples/fashion.jpg", title: "Fashion drop", tag: "Fashion", orientation: "portrait", source: "https://www.pexels.com/video/model-posing-for-a-photoshoot-with-a-yellow-background-7669618/" },
  { src: "/showcase/samples/phone.mp4", poster: "/showcase/samples/phone.jpg", title: "New phone in hand", tag: "Electronics", orientation: "portrait", source: "https://www.pexels.com/video/hand-holding-phone-with-icons-on-screen-11698130/" },
  { src: "/showcase/samples/coffee.mp4", poster: "/showcase/samples/coffee.jpg", title: "The morning pour", tag: "Cafés", orientation: "portrait", source: "https://www.pexels.com/video/pouring-fresh-coffee-into-ceramic-mug-27938665/" },
  { src: "/showcase/samples/skincare.mp4", poster: "/showcase/samples/skincare.jpg", title: "Clean skincare", tag: "Cosmetics", orientation: "portrait", source: "https://www.pexels.com/video/person-placing-a-skin-care-product-in-frame-6343712/" },
  { src: "/showcase/samples/sneakers.mp4", poster: "/showcase/samples/sneakers.jpg", title: "Fresh kicks", tag: "Footwear", orientation: "portrait", source: "https://www.pexels.com/video/man-tying-shoelaces-on-steps-outdoors-29892299/" },
  { src: "/showcase/samples/nairobi.mp4", poster: "/showcase/samples/nairobi.jpg", title: "Nairobi skyline", tag: "Real estate", orientation: "landscape", source: "https://www.pexels.com/video/stunning-nairobi-cityscape-aerial-view-at-sunset-29069375/" },
];

export const HOW_IT_WORKS = [
  {
    title: "Describe it",
    body: "A sentence or two: the product, the offer, where it will run. The Studio works out the length, the shape and the credits before anything is made.",
  },
  {
    title: "Generate",
    body: "Seedance video up to 30 seconds with sound, and Soul images in every social shape. Animate an image or extend a clip in one tap.",
  },
  {
    title: "Publish and sell",
    body: "Schedule to Facebook and Instagram with a tracked WhatsApp link, and let auto-replies answer the people who write.",
  },
] as const;

/** The questions, worded with the price list in force. */
export const faqFor = (p: Pricing) => [
  {
    q: "What is a credit?",
    a: `Everything in the Studio is paid with credits from one wallet. An image is ${p.imageCredits} credits; video is ${p.videoCreditsPerStep} credits per started ${p.videoStepSeconds} seconds, so a 10-second clip is ${videoCreditsFor(p, 10)} credits. Credits never expire.`,
  },
  {
    q: "How do I pay?",
    a: "By M-Pesa (a prompt on your phone; enter your PIN) or with Paystack: Visa, Mastercard, M-Pesa or Apple Pay on Paystack's secure page. We never ask for your PIN or card number on our own pages.",
  },
  {
    q: "Do plans renew automatically?",
    a: "Plans paid by card renew themselves until you switch renewal off in Billing. Plans paid by M-Pesa run for the month or year you paid for; we remind you three days before they end.",
  },
  {
    q: "What happens to my credits if my plan ends?",
    a: "They stay in your wallet. A plan ending only stops new monthly credits; you can keep using what you have or top up.",
  },
  {
    q: "Can you make it for me?",
    a: "Yes. Order a done-for-you image or video below, pay for the credits it uses, and follow it on your private order page until the files arrive.",
  },
  {
    q: "Can I get captions, a voice-over or music?",
    a: "Yes. Those are priced on request: use “Something else” in the order form and tell us what you need.",
  },
] as const;
