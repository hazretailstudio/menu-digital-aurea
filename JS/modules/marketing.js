import { REST_ID, showToast } from '../config.js';
import { client, dbWrite } from '../state.js';

export async function saveGoogleMapsEmbed() {
  const val = document.getElementById('gmapsEmbedInput')?.value?.trim();
  if (!val) {
    showToast('Pega el código iframe de Google Maps primero.', 'warning');
    return;
  }
  const { error } = await dbWrite(client.from('restaurants').update({ google_maps_embed: val }).eq('id', REST_ID), 'guardar Google Maps');
  if (error) return;
  const prev = document.getElementById('gmapsPreviewContainer');
  if (prev) prev.innerHTML = val;
  showToast('Ficha de Google Maps vinculada correctamente ✓', 'success');
}
