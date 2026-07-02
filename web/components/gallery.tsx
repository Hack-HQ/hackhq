import { GalleryPhoto } from "@/lib/types";
import Image from "next/image";

export default function Gallery({ gallery }: { gallery: GalleryPhoto[] }) {
    return (
        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Gallery
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Real photos from hackathons people found through this list.
          </p>
          {gallery.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {gallery.map((photo) => (
                <div
                  key={photo.src}
                  className="relative aspect-square w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
                >
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    className="object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              Gallery unavailable.
            </p>
          )}
        </section>
    );
}