-- No external shapes, fonts, sprites or coastline downloads.
node_keys = {}
way_keys = { "highway", "building", "natural", "water" }
function node_function() end
function way_function()
    local highway = Find("highway")
    if highway ~= "" then
        Layer("roads", false)
        Attribute("class", highway)
    end
    if Find("building") ~= "" and Find("building") ~= "no" and IsClosed() then
        Layer("buildings", true)
    end
    if Find("natural") == "water" and IsClosed() then
        Layer("water", true)
    end
end
