SELECT COUNT(DISTINCT tcrs.content_id) AS total_tracks
FROM mvcms.tbl_content_rights_status tcrs
INNER JOIN mvcms.tbl_contents trk
    ON trk.content_id = tcrs.content_id
INNER JOIN mvcms.tbl_content_status s
    ON s.content_id = tcrs.content_id
INNER JOIN mvcms.tbl_package_content_map pcm
    ON trk.content_id = pcm.content_id
INNER JOIN mvcms.tbl_contents album
    ON album.content_id = pcm.package_content_id
INNER JOIN mvcms.tbl_content_details cd
    ON album.content_id = cd.content_id
INNER JOIN mvcms.tbl_content_details cdt
    ON trk.content_id = cdt.content_id
WHERE tcrs.rights_status IN ('LIVE','MANUAL')
  AND tcrs.retailer_id = $1
  AND cd.language_id = 'eng'
  AND cdt.language_id = 'eng'
  AND trk.content_type_id IN (21)
  AND s.locale_id = 'eng'
  AND s.status IN ('ACTIVE','INACTIVE');
