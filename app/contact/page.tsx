import FrontendNavbar from "@/components/Frontend-Navbar";
import { MapPin, Phone, Mail, Clock, Train, Bus } from "lucide-react";
import { getSiteContact } from "./data";

function MultiLine({ text }: { text: string }) {
    return (
        <>
            {text.split('\n').map((line, i, arr) => (
                <span key={i}>
                    {line}
                    {i < arr.length - 1 && <br />}
                </span>
            ))}
        </>
    );
}

// Like MultiLine, but bolds the label before the first " : " on each line
// (reproduces the legacy Permanences styling: "**Mardi** : 9h - 17h").
function HoursLines({ text }: { text: string }) {
    return (
        <>
            {text.split('\n').map((line, i, arr) => {
                const idx = line.indexOf(' : ');
                return (
                    <span key={i}>
                        {idx === -1 ? line : (
                            <>
                                <span className="font-medium">{line.slice(0, idx)}</span>
                                {line.slice(idx)}
                            </>
                        )}
                        {i < arr.length - 1 && <br />}
                    </span>
                );
            })}
        </>
    );
}

export default async function Contact() {
    const contact = await getSiteContact();

    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-12">
                {/* Hero Section */}
                <section className="text-center glass-card-lg p-12">
                    <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">Coordonnées</h1>
                    <p className="text-lg text-gray-700 dark:text-gray-100">Contactez-nous ou venez nous rendre visite</p>
                </section>

                {!contact ? (
                    <section className="glass-card p-8 text-center">
                        <p className="text-gray-700 dark:text-gray-100">
                            Les coordonnées seront bientôt disponibles.
                        </p>
                    </section>
                ) : (
                    <section className="glass-card p-8 space-y-6">
                        <div className="text-center pb-6 border-b border-gray-200 dark:border-gray-700">
                            <p className="font-bold text-2xl text-gray-900 dark:text-white mb-2">
                                {contact.orgName}
                            </p>
                            {contact.orgSubtitle && (
                                <p className="font-bold text-xl text-gray-800 dark:text-gray-200">
                                    {contact.orgSubtitle}
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-stretch">
                            {/* Adresse */}
                            <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg">
                                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                                    <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Adresse</h3>
                                    <p className="text-gray-700 dark:text-gray-100"><MultiLine text={contact.addressLines} /></p>
                                </div>
                            </div>

                            {/* Permanences */}
                            <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg">
                                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                                    <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Permanences</h3>
                                    <p className="text-gray-700 dark:text-gray-100"><HoursLines text={contact.hoursText} /></p>
                                </div>
                            </div>

                            {/* Téléphone */}
                            <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg">
                                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                                    <Phone className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Téléphone</h3>
                                    <p className="text-gray-700 dark:text-gray-100"><MultiLine text={contact.phones} /></p>
                                </div>
                            </div>

                            {/* Métro */}
                            {contact.metroText && (
                                <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg">
                                    <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                                        <Train className="h-5 w-5 text-red-600 dark:text-red-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Métro</h3>
                                        <p className="text-gray-700 dark:text-gray-100"><MultiLine text={contact.metroText} /></p>
                                    </div>
                                </div>
                            )}

                            {/* Email */}
                            <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg">
                                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                                    <Mail className="h-5 w-5 text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Email</h3>
                                    <a
                                        href={`mailto:${contact.email}`}
                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
                                    >
                                        {contact.email}
                                    </a>
                                </div>
                            </div>

                            {/* Autobus */}
                            {contact.busText && (
                                <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg">
                                    <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                                        <Bus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Autobus</h3>
                                        <p className="text-gray-700 dark:text-gray-100"><MultiLine text={contact.busText} /></p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* Visit Info */}
                <section className="glass-card-lg p-8 text-center bg-gradient-to-r from-blue-500/10 to-purple-500/10">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Venez nous rendre visite</h2>
                    <p className="text-gray-700 dark:text-gray-100 max-w-2xl mx-auto">
                        {contact?.visitText
                            ? <MultiLine text={contact.visitText} />
                            : "Notre équipe sera ravie de vous accueillir pendant nos permanences. N'hésitez pas à nous contacter avant de vous déplacer pour vous assurer de notre disponibilité."}
                    </p>
                </section>
            </div>
        </main>
    );
}
