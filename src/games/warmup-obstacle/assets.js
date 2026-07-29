// 이미지 로더 — AE 프로젝트와 동일한 파일명 규칙(bg_/obs_/char_/fx_/signs_)
const IMAGE_NAMES = [
  'char_idle_1','char_idle_2',
  'char_run01','char_run02','char_run03','char_run04','char_run05',
  'char_jump_prep','char_jump_air','char_slide',
  'char_stretch_lunge','char_stretch_forwardbend','char_stretch_armsopen',
  'obs_cube_star_left','obs_cube_star_center','obs_cube_star_right',
  'obs_hurdle_low','obs_hurdle_wide',
  'obs_sign_stretch_lunge','obs_sign_stretch_forwardbend','obs_sign_stretch_armsopen',
  'obs_arch_gate',
  'signs_left','signs_right','signs_up','signs_down','signs_pose',
  'fx_count_1','fx_count_2','fx_count_3','fx_start_word',
  'fx_level_complete_1','fx_level_complete_2','fx_level_complete_3','fx_level_complete_4','fx_level_complete_5',
  'fx_mission_complete','fx_podium','fx_title_screen',
  'bg_sky','bg_buildings',
  'bg_planet_orange_striped','bg_planet_purple','bg_rocket_pink',
  'bg_mascot_bunny_blue','bg_mascot_robot_blue',
  'bg_star_deco_yellow','bg_star_outline_pink',
  'bg_tower_purple_slide','bg_target_pole_purple',
  'bg_star_deco_purple','bg_star_deco_yellow_small','bg_star_mascot_yellow',
  'bg_tower_cannon_blue','bg_tower_spiral_slide','bg_tower_teal_slide',
  'pose01','pose02','pose03','start_line',
];

export const IMG = {};

export async function loadAssets(onProgress) {
  let done = 0;
  await Promise.all(IMAGE_NAMES.map(name => new Promise(resolve => {
    const img = new Image();
    img.onload = () => { IMG[name] = img; done++; onProgress?.(done / IMAGE_NAMES.length); resolve(); };
    img.onerror = () => { console.warn('image missing:', name); done++; resolve(); };
    img.src = `/assets/warmup/image/${name}.png`;
  })));
}
