import { client } from '../state.js';
import { REST_ID } from '../config.js';

export function saveGoogleMapsEmbed() {
  const val = document.getElementById('gmapsEmbedInput')?.value?.trim();
  if (!val) return;
  document.getElementById('gmapsPreviewContainer').innerHTML = val;
  if (client) client.from('restaurants').update({ google_maps_embed: val }).eq('id', REST_ID);
  alert("Ficha de Google Maps vinculada correctamente.");
}