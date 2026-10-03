/**
 * Server services for the platform. Routes import the individual service files;
 * this barrel lists the main entry points for orientation.
 */

export { createBrand, listBrands, getBrandById as getBrand, updateBrand, deleteBrand as archiveBrand } from "./brands";
export { createTask, listTasks, getTask, updateTask } from "./content";
export { connectMetaPages, connectWhatsAppNumber, listChannels, disconnectChannel, schedulePosts, listPosts } from "./social";
export { createCampaign, listCampaigns, getCampaignDetail, updateCampaign, archiveCampaign, createTrackedLink } from "./campaigns";
export { createCatalogueItem, listCatalogueItems, updateCatalogueItem, deleteCatalogueItem } from "./catalogue";
export { generateAi, generateForOrganization, aiStatus, resolveModel, getAiProviderName } from "./ai";
export { processWebhook, sendWhatsAppText, listConversations, listContacts } from "./whatsapp";
export { fireAutomations, listAutomations, createAutomation } from "./automations";
export { sendEmail } from "./email";
